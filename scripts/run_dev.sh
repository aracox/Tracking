#!/usr/bin/env bash
# Starts FastAPI (http://localhost:8000) and Vite (http://localhost:5173).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [ ! -x "$ROOT/backend/.venv/bin/python" ]; then
  echo "==> Creating backend venv"
  if command -v uv >/dev/null 2>&1; then
    uv venv --python 3.12 "$ROOT/backend/.venv"
    uv pip install -q -p "$ROOT/backend/.venv/bin/python" -r "$ROOT/backend/requirements.txt"
  else
    python3 -m venv "$ROOT/backend/.venv"
    "$ROOT/backend/.venv/bin/pip" install -q -r "$ROOT/backend/requirements.txt"
  fi
fi
[ -d "$ROOT/frontend/node_modules" ] || (echo "==> npm install" && cd "$ROOT/frontend" && npm install)

cleanup() { kill "${BACK:-}" "${FRONT:-}" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

(cd "$ROOT/backend" && exec .venv/bin/uvicorn app.main:app --reload --port 8000) & BACK=$!
(cd "$ROOT/frontend" && exec npm run dev) & FRONT=$!

echo "Frontend: http://localhost:5173   Backend: http://localhost:8000   Docs: http://localhost:8000/docs"
wait
