#!/usr/bin/env bash
# ============================================================================
# setup.sh  —  ONE-TIME infrastructure bootstrap for WhatsApp Mate on GCP
#
# All data services (MongoDB, Redis, RabbitMQ) run as Docker containers on a
# Compute Engine VM inside a private VPC. Cloud Run services reach them via
# a Serverless VPC Access connector — no external managed services needed.
#
# Prerequisites:
#   • gcloud CLI installed and authenticated  (gcloud auth login)
#   • deploy/.env.deploy file filled out (copy from .env.deploy.example)
#
# Usage:
#   cd deploy
#   cp .env.deploy.example .env.deploy   # fill in GCP_PROJECT + RABBITMQ_PASSWORD
#   bash setup.sh
# ============================================================================
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Load config ──────────────────────────────────────────────────────────────
ENV_FILE="$SCRIPT_DIR/.env.deploy"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE not found. Copy .env.deploy.example and fill it in."
  exit 1
fi
set -o allexport; source "$ENV_FILE"; set +o allexport

echo "==> Project : $GCP_PROJECT"
echo "==> Region  : $GCP_REGION"
echo ""

gcloud config set project "$GCP_PROJECT"

# ── Enable required APIs ──────────────────────────────────────────────────────
echo "==> Enabling GCP APIs..."
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  storage.googleapis.com \
  compute.googleapis.com \
  vpcaccess.googleapis.com \
  --quiet

# ── Serverless VPC Access connector (on default network) ─────────────────────
# NOTE: The connector must be on the same network as the data VM.
# We use the 'default' network because it already has internet routes,
# which are required for the connector's internal VMs to bootstrap.
echo "==> Creating Serverless VPC Access connector: $VPC_CONNECTOR..."
gcloud compute networks vpc-access connectors create "$VPC_CONNECTOR" \
  --network=default \
  --region="$GCP_REGION" \
  --range="10.8.0.0/28" \
  --quiet 2>/dev/null || echo "    (connector already exists)"

# Allow traffic from the connector range to the data VM's DB ports
gcloud compute firewall-rules create wm-allow-db-from-connector \
  --network=default \
  --allow=tcp:27017,tcp:6379,tcp:5672 \
  --source-ranges=10.8.0.0/28 \
  --target-tags=wm-data \
  --quiet 2>/dev/null || echo "    (firewall rule already exists)"

# ── Compute Engine VM: data services ─────────────────────────────────────────
echo "==> Creating data VM (MongoDB + Redis + RabbitMQ)..."

# Substitute RABBITMQ_PASSWORD into the startup script
STARTUP_SCRIPT=$(sed "s/RABBITMQ_PASSWORD_PLACEHOLDER/${RABBITMQ_PASSWORD}/g" \
  "$SCRIPT_DIR/vm-startup.sh")

gcloud compute instances create wm-data \
  --zone="${GCP_REGION}-a" \
  --machine-type=e2-standard-2 \
  --network=default \
  --boot-disk-size=20GB \
  --boot-disk-type=pd-ssd \
  --create-disk="name=wm-data-disk,size=50GB,type=pd-ssd,auto-delete=yes" \
  --metadata=startup-script="$STARTUP_SCRIPT" \
  --tags=wm-data \
  --quiet 2>/dev/null || echo "    (VM already exists)"

# Wait for VM to get an internal IP
echo "==> Waiting for VM internal IP..."
sleep 10
VM_IP=$(gcloud compute instances describe wm-data \
  --zone="${GCP_REGION}-a" \
  --format="value(networkInterfaces[0].networkIP)")
echo "    VM internal IP: $VM_IP"

# Mount the data disk on first create
gcloud compute ssh wm-data --zone="${GCP_REGION}-a" --tunnel-through-iap \
  --command='
    set -e
    if ! mountpoint -q /data; then
      sudo mkfs.ext4 -F /dev/sdb 2>/dev/null || true
      sudo mkdir -p /data
      sudo mount /dev/sdb /data
      echo "/dev/sdb /data ext4 defaults 0 2" | sudo tee -a /etc/fstab
    fi
  ' 2>/dev/null || echo "    (disk already mounted or SSH not ready yet — will mount on next startup)"

# ── Artifact Registry repo ───────────────────────────────────────────────────
echo "==> Creating Artifact Registry repository: $AR_REPO..."
gcloud artifacts repositories create "$AR_REPO" \
  --repository-format=docker \
  --location="$GCP_REGION" \
  --quiet 2>/dev/null || echo "    (already exists)"

# ── GCS bucket for ChromaDB ───────────────────────────────────────────────────
CHROMA_BUCKET="${GCP_PROJECT}-chroma-data"
echo "==> Creating GCS bucket for ChromaDB: $CHROMA_BUCKET..."
gcloud storage buckets create "gs://$CHROMA_BUCKET" \
  --location="$GCP_REGION" \
  --uniform-bucket-level-access 2>/dev/null || echo "    (already exists)"

# ── Secret Manager secrets ────────────────────────────────────────────────────
echo "==> Storing connection strings in Secret Manager..."

MONGO_URL="mongodb://${VM_IP}:27017"
REDIS_URL="redis://${VM_IP}:6379/0"
RABBITMQ_URL="amqp://wm:${RABBITMQ_PASSWORD}@${VM_IP}:5672/"

create_or_update_secret() {
  local name="$1"; local value="$2"
  if gcloud secrets describe "$name" --quiet &>/dev/null; then
    echo -n "$value" | gcloud secrets versions add "$name" --data-file=-
    echo "    Updated: $name"
  else
    echo -n "$value" | gcloud secrets create "$name" \
      --replication-policy=automatic --data-file=-
    echo "    Created: $name"
  fi
}

create_or_update_secret "wm-mongo-url"    "$MONGO_URL"
create_or_update_secret "wm-redis-url"    "$REDIS_URL"
create_or_update_secret "wm-rabbitmq-url" "$RABBITMQ_URL"

# ── IAM bindings ──────────────────────────────────────────────────────────────
echo "==> Granting IAM permissions..."

PROJECT_NUMBER=$(gcloud projects describe "$GCP_PROJECT" --format="value(projectNumber)")
CLOUDBUILD_SA="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"
CLOUDRUN_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

for SA in "$CLOUDBUILD_SA" "$CLOUDRUN_SA"; do
  for SECRET in wm-mongo-url wm-redis-url wm-rabbitmq-url; do
    gcloud secrets add-iam-policy-binding "$SECRET" \
      --member="serviceAccount:$SA" \
      --role="roles/secretmanager.secretAccessor" --quiet
  done
done

gcloud projects add-iam-policy-binding "$GCP_PROJECT" \
  --member="serviceAccount:$CLOUDBUILD_SA" --role="roles/run.admin" --quiet
gcloud projects add-iam-policy-binding "$GCP_PROJECT" \
  --member="serviceAccount:$CLOUDBUILD_SA" --role="roles/iam.serviceAccountUser" --quiet
gcloud projects add-iam-policy-binding "$GCP_PROJECT" \
  --member="serviceAccount:$CLOUDBUILD_SA" --role="roles/compute.viewer" --quiet

gcloud storage buckets add-iam-policy-binding "gs://$CHROMA_BUCKET" \
  --member="serviceAccount:$CLOUDRUN_SA" --role="roles/storage.objectAdmin" --quiet

# ── Cloud Build trigger ───────────────────────────────────────────────────────
echo "==> Creating Cloud Build trigger for 'deploy' branch..."
REPO_NAME=$(basename "$(git -C "$SCRIPT_DIR/.." rev-parse --show-toplevel)")
GITHUB_OWNER=$(git -C "$SCRIPT_DIR/.." remote get-url origin | sed 's/.*github.com[:/]\([^/]*\)\/.*/\1/')

gcloud builds triggers create github \
  --name="whatsapp-mate-deploy" \
  --repo-name="$REPO_NAME" \
  --repo-owner="$GITHUB_OWNER" \
  --branch-pattern="^deploy$" \
  --build-config="deploy/cloudbuild.yaml" \
  --substitutions="_GCP_REGION=${GCP_REGION},_AR_REPO=${AR_REPO},_VPC_CONNECTOR=${VPC_CONNECTOR}" \
  --quiet 2>/dev/null || echo "    (trigger already exists or needs manual GitHub connection)"

echo ""
echo "=========================================================="
echo " Setup complete!"
echo "=========================================================="
echo ""
echo " Data VM internal IP : $VM_IP"
echo " MongoDB             : mongodb://${VM_IP}:27017"
echo " Redis               : redis://${VM_IP}:6379"
echo " RabbitMQ            : amqp://wm:***@${VM_IP}:5672/"
echo ""
echo " Next steps:"
echo "  1. If the Cloud Build trigger wasn't created automatically, connect"
echo "     your GitHub repo at:"
echo "     https://console.cloud.google.com/cloud-build/triggers"
echo ""
echo "  2. Push the 'deploy' branch to trigger your first build:"
echo "     git push origin deploy"
echo ""
echo "  3. Monitor the build at:"
echo "     https://console.cloud.google.com/cloud-build/builds?project=$GCP_PROJECT"
echo "=========================================================="
