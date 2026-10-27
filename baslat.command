#!/bin/zsh
# macOS karşılığı: baslat.bat — Finder'da çift tıklayınca API ve Web'i başlatır.
cd "$(dirname "$0")"
export PATH="$HOME/.local/node/bin:$PATH"

echo "AQUAI baslatiliyor..."
echo "  API : http://localhost:3001"
echo "  Web : http://localhost:3000"
echo
echo "Durdurmak icin Ctrl+C."
echo

# Önceki bir oturumdan açık kalan sunucular varsa portları boşalt (EADDRINUSE olmasın).
for port in 3000 3001; do
  pids=$(lsof -ti tcp:$port -sTCP:LISTEN)
  if [ -n "$pids" ]; then
    echo "Port $port kullanimda, eski surec kapatiliyor..."
    kill $pids 2>/dev/null
  fi
done
sleep 1

# Ctrl+C ya da pencere kapatılınca iki sunucuyu da kapat.
trap 'kill 0' INT TERM EXIT

pnpm --filter @aquai/api run dev &
pnpm --filter @aquai/web run dev &
wait
