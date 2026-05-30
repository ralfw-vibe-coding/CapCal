#!/usr/bin/env bash
# Smoke-Test-Instanz: Filesystem-Provider (kein Login), eigene Ports und
# Wegwerf-Daten. Stoert die normale Dev-Instanz (5173/3001) nicht.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

export STATE_PROVIDER=filesystem
export DATABASE_PATH="./data-smoke"
export PORT=3099

npm run server &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT

VITE_DEV_PORT=5199 VITE_API_TARGET="http://127.0.0.1:3099" npm run dev
