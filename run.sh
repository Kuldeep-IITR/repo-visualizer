#!/usr/bin/env bash
# Starts the backend (port 8000) and the frontend (port 5173). Ctrl+C stops both.
cd "$(dirname "$0")"

if [ ! -x backend/.venv/bin/uvicorn ] || [ ! -d frontend/node_modules ]; then
  echo "Dependencies are missing – running ./setup.sh first"
  ./setup.sh || exit 1
  echo
fi

if [ ! -f backend/.env ] || grep -q "your_key_here" backend/.env 2>/dev/null; then
  echo "ℹ No Gemini key in backend/.env – everything works except the 'Explain with AI' button."
fi

trap 'kill 0' EXIT INT TERM     # kill both children when this script exits

(cd backend && .venv/bin/uvicorn app.main:app --reload --port 8000) &
(cd frontend && npm run dev -- --host localhost) &
sleep 2
echo
echo "  ➜  App:       http://localhost:5173"
echo "  ➜  API docs:  http://localhost:8000/docs"
echo "  Press Ctrl+C to stop."
wait
