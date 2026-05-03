#!/usr/bin/env bash
# Entrypoint for Cloud Run worker services.
# Cloud Run requires containers to bind to $PORT and respond to HTTP health checks.
# This script starts a tiny Python health server in the background, then runs the worker.
set -e

HEALTH_PORT="${PORT:-8080}"

python3 - <<'PYEOF' &
import http.server, os, threading, sys

class HealthHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"ok")
    def log_message(self, *a):
        pass  # suppress access logs

port = int(os.environ.get("PORT", 8080))
server = http.server.HTTPServer(("", port), HealthHandler)
sys.stdout.write(f"[health] listening on port {port}\n")
sys.stdout.flush()
server.serve_forever()
PYEOF

echo "[worker] starting: python worker.py $*"
exec python worker.py "$@"
