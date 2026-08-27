#!/bin/zsh
# Запуск User Dashboard: backend (:3001) + frontend (:5173) одной командой.
# Использование:  ./start.sh   (останавливается по Ctrl+C)

cd "$(dirname "$0")"

echo "🚀 Запускаю backend (http://localhost:3001)…"
(cd backend && npm start) &
BACK=$!

echo "🎨 Запускаю frontend (http://localhost:5173)…"
(cd frontend && npm run dev) &
FRONT=$!

# Остановить оба процесса по Ctrl+C
trap "echo '⏹  Останавливаю…'; kill $BACK $FRONT 2>/dev/null; exit" INT TERM
wait
