#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUNDLED_NODE="/Users/ralfw/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"

usage() {
  cat <<'EOF'
Usage:
  ./run.sh              Start server and client
  ./run.sh --server     Start only the API server
  ./run.sh --client     Start only the Vite client
EOF
}

start_server() {
  cd "$ROOT_DIR"
  npm run server
}

start_client() {
  cd "$ROOT_DIR"
  if [[ -x "$BUNDLED_NODE" ]]; then
    "$BUNDLED_NODE" node_modules/vite/bin/vite.js --host 127.0.0.1
  else
    npm run dev
  fi
}

case "${1:-}" in
  --server)
    start_server
    ;;
  --client)
    start_client
    ;;
  -h|--help)
    usage
    ;;
  "")
    trap 'kill 0' INT TERM EXIT
    start_server &
    start_client &
    wait
    ;;
  *)
    usage
    exit 1
    ;;
esac
