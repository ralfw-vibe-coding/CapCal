#!/usr/bin/env bash
# Smoke-Test-Instanz MIT Auth: Postgres (DATABASE_URL aus .env, Test-Branch),
# OTP wird ins Serverlog geschrieben (RESEND_API_KEY leer). Eigene Ports, stoert
# die normale Dev-Instanz nicht. Nur fuer manuelle/Smoke-Tests des Auth-Pfads.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

export STATE_PROVIDER=postgres
export RESEND_API_KEY=""
export PORT=3099

npm run server &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT

VITE_DEV_PORT=5199 VITE_API_TARGET="http://127.0.0.1:3099" npm run dev
