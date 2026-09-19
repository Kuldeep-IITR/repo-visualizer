#!/usr/bin/env bash
# Starts backend (port 8000) and frontend (port 5173) together. Ctrl+C stops both.
cd "$(dirname "$0")"
(cd backend && .venv/bin/uvicorn app.main:app --reload --port 8000) &
(cd frontend && npm run dev) &
wait
