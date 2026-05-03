#!/usr/bin/env bash
# ============================================================================
# deploy.sh  —  Manual build + deploy (no Cloud Build trigger needed)
#
# Use this for first-time deploys or hotfixes without waiting for CI.
# Requires: gcloud CLI authenticated, Docker running, deploy/.env.deploy filled.
#
# Usage:
#   cd deploy
#   bash deploy.sh               # build + push + deploy all services
#   bash deploy.sh --skip-build  # redeploy using existing :latest images
# ============================================================================
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

ENV_FILE="$SCRIPT_DIR/.env.deploy"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE not found. Copy .env.deploy.example and fill it in."
  exit 1
fi
set -o allexport; source "$ENV_FILE"; set +o allexport

SKIP_BUILD=false
for arg in "$@"; do [[ "$arg" == "--skip-build" ]] && SKIP_BUILD=true; done

gcloud config set project "$GCP_PROJECT"

REGISTRY="${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT}/${AR_REPO}"
TAG=$(git -C "$REPO_ROOT" rev-parse --short HEAD)
CHROMA_BUCKET="${GCP_PROJECT}-chroma-data"

gcloud auth configure-docker "${GCP_REGION}-docker.pkg.dev" --quiet

if [[ "$SKIP_BUILD" != "true" ]]; then
  echo "==> Building images (tag: $TAG)..."
  docker build -t "${REGISTRY}/wm-backend:${TAG}" -t "${REGISTRY}/wm-backend:latest" \
    "$REPO_ROOT/backend"
  docker build -t "${REGISTRY}/wm-frontend:${TAG}" -t "${REGISTRY}/wm-frontend:latest" \
    "$REPO_ROOT/frontend"
  echo "==> Pushing images..."
  docker push --all-tags "${REGISTRY}/wm-backend"
  docker push --all-tags "${REGISTRY}/wm-frontend"
else
  TAG="latest"
fi

cr() {
  gcloud run deploy "$@" --region="$GCP_REGION" --platform=managed --quiet
}

# ── ChromaDB ──────────────────────────────────────────────────────────────────
echo "==> Deploying wm-chroma..."
cr wm-chroma \
  --image="chromadb/chroma:0.5.5" \
  --execution-environment=gen2 \
  --port=8000 \
  --cpu=1 --memory=1Gi \
  --min-instances=1 --max-instances=1 \
  --no-cpu-throttling \
  --vpc-connector="$VPC_CONNECTOR" \
  --vpc-egress=private-ranges-only \
  --add-volume="name=chroma-data,type=cloud-storage,bucket=${CHROMA_BUCKET}" \
  --add-volume-mount="volume=chroma-data,mount-path=/chroma/chroma" \
  --no-allow-unauthenticated \
  --set-env-vars="IS_PERSISTENT=1"

CHROMA_URL=$(gcloud run services describe wm-chroma --region="$GCP_REGION" --format='value(status.url)')
CHROMA_HOST="${CHROMA_URL#https://}"
echo "    ChromaDB host: $CHROMA_HOST"

SHARED_SECRETS="MONGO_URL=wm-mongo-url:latest,REDIS_URL=wm-redis-url:latest,RABBITMQ_URL=wm-rabbitmq-url:latest"
CHROMA_VARS="CHROMA_HOST=${CHROMA_HOST},CHROMA_PORT=443,CHROMA_SSL=true"
VPC_FLAGS="--vpc-connector=$VPC_CONNECTOR --vpc-egress=private-ranges-only"

# ── Backend ───────────────────────────────────────────────────────────────────
echo "==> Deploying wm-backend..."
cr wm-backend \
  --image="${REGISTRY}/wm-backend:${TAG}" \
  --port=8000 \
  --cpu=2 --memory=2Gi \
  --min-instances=1 --max-instances=10 \
  --concurrency=80 \
  --allow-unauthenticated \
  $VPC_FLAGS \
  --set-secrets="$SHARED_SECRETS" \
  --set-env-vars="MONGO_DB=whatsapp_mate,STREAM_PARTITIONS=16,MONGO_POOL_SIZE=200,${CHROMA_VARS}"

BACKEND_URL=$(gcloud run services describe wm-backend --region="$GCP_REGION" --format='value(status.url)')
echo "    Backend URL: $BACKEND_URL"

# ── Worker inbound ────────────────────────────────────────────────────────────
echo "==> Deploying wm-worker-inbound..."
cr wm-worker-inbound \
  --image="${REGISTRY}/wm-backend:${TAG}" \
  --port=8080 \
  --cpu=2 --memory=2Gi \
  --min-instances=1 --max-instances=5 \
  --no-cpu-throttling \
  --no-allow-unauthenticated \
  $VPC_FLAGS \
  --command="/app/start-worker.sh" \
  --args="--mode,inbound" \
  --set-secrets="$SHARED_SECRETS" \
  --set-env-vars="MONGO_DB=whatsapp_mate,STREAM_PARTITIONS=16,WORKER_CONCURRENCY=50,${CHROMA_VARS}"

# ── Worker jobs ───────────────────────────────────────────────────────────────
echo "==> Deploying wm-worker-jobs..."
cr wm-worker-jobs \
  --image="${REGISTRY}/wm-backend:${TAG}" \
  --port=8080 \
  --cpu=2 --memory=2Gi \
  --min-instances=1 --max-instances=3 \
  --no-cpu-throttling \
  --no-allow-unauthenticated \
  $VPC_FLAGS \
  --command="/app/start-worker.sh" \
  --args="--mode,jobs" \
  --set-secrets="$SHARED_SECRETS" \
  --set-env-vars="MONGO_DB=whatsapp_mate,STREAM_PARTITIONS=16,${CHROMA_VARS}"

# ── Frontend ──────────────────────────────────────────────────────────────────
echo "==> Deploying wm-frontend..."
cr wm-frontend \
  --image="${REGISTRY}/wm-frontend:${TAG}" \
  --port=3000 \
  --cpu=1 --memory=512Mi \
  --min-instances=1 --max-instances=5 \
  --allow-unauthenticated \
  --set-env-vars="BACKEND_URL=${BACKEND_URL}"

FRONTEND_URL=$(gcloud run services describe wm-frontend --region="$GCP_REGION" --format='value(status.url)')

echo ""
echo "=========================================================="
echo " Deployment complete!"
echo "=========================================================="
echo " Frontend : $FRONTEND_URL"
echo " Backend  : $BACKEND_URL"
echo " ChromaDB : $CHROMA_URL"
echo ""
echo " Webhook URL for Meta App config:"
echo " ${BACKEND_URL}/webhook/<your-bot-id>"
echo "=========================================================="
