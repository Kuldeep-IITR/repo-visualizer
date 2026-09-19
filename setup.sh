#!/usr/bin/env bash
# One-time setup: creates the Python virtualenv, installs backend and frontend
# dependencies, and creates backend/.env from the example if it doesn't exist.
# Safe to run again – it only installs what's missing.
set -e
cd "$(dirname "$0")"

need() { command -v "$1" >/dev/null 2>&1 || { echo "✗ $1 is required but not installed. $2"; exit 1; }; }
need python3 "Install Python 3.11+ from https://www.python.org/downloads/"
need node    "Install Node 18+ from https://nodejs.org/"
need npm     "npm ships with Node."

echo "▸ Python $(python3 --version | cut -d' ' -f2), Node $(node --version)"

if [ ! -d backend/.venv ]; then
  echo "▸ Creating Python virtualenv in backend/.venv"
  python3 -m venv backend/.venv
fi
echo "▸ Installing backend dependencies"
backend/.venv/bin/pip install -q --upgrade pip
backend/.venv/bin/pip install -q -r backend/requirements.txt

echo "▸ Installing frontend dependencies"
(cd frontend && npm install --silent)

if [ ! -f backend/.env ]; then
  cp backend/.env.example backend/.env
  echo "▸ Created backend/.env – add your Gemini key there to enable AI summaries (optional)"
fi

echo
echo "✓ Setup complete. Start the app with:  ./run.sh"
