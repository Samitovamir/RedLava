#!/bin/zsh
# Start the dashboard: backend (:3001) + frontend (:5173) with one command.
# Usage:  ./start.sh   (stop with Ctrl+C)

cd "$(dirname "$0")"

echo "🚀 Starting backend (http://localhost:3001)…"
(cd backend && npm start) &
BACK=$!

echo "🎨 Starting frontend (http://localhost:5173)…"
(cd frontend && npm run dev) &
FRONT=$!

# Stop both processes on Ctrl+C
trap "echo '⏹  Stopping…'; kill $BACK $FRONT 2>/dev/null; exit" INT TERM
wait
