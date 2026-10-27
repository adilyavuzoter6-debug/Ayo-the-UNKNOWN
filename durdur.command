#!/bin/zsh
# Piscatio.app'in arka planda başlattığı API (3001) ve Web (3000) sunucularını kapatır.
for port in 3000 3001; do
  pids=$(lsof -ti tcp:$port -sTCP:LISTEN)
  [ -n "$pids" ] && kill $pids && echo "Port $port kapatildi."
done
echo "Piscatio durduruldu."
