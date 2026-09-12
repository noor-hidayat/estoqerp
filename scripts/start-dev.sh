#!/bin/bash
set -e
cd "$(dirname "$0")/.."
if ss -tulpn | grep -q ":3001" && ss -tulpn | grep -q ":5173"; then
  echo "Dev already running:"
  PUBLIC_IP=$(curl -s --max-time 3 https://api.ipify.org || echo "localhost")
  echo "  Backend: http://localhost:3001/api/health  (public: http://${PUBLIC_IP}:3001/api/health)"
  echo "  Frontend: http://localhost:5173  (public: http://${PUBLIC_IP}:5173)"
  exit 0
fi
echo "Starting EstoqERP dev mode (backend + frontend)..."
# Default HTTP untuk akses public IP. Set VITE_HTTPS=true jika butuh kamera via HTTPS (self-signed)
export VITE_HTTPS=${VITE_HTTPS:-false}
nohup bash -c 'npm run dev' > /tmp/estoqerp-dev.log 2>&1 &
sleep 5
echo "Logs: tail -f /tmp/estoqerp-dev.log"
PUBLIC_IP=$(curl -s --max-time 3 https://api.ipify.org || echo "localhost")
curl -s http://localhost:3001/api/health | grep -q ok && echo "✓ Backend OK: http://localhost:3001 (public: http://${PUBLIC_IP}:3001/api/health)" || echo "✗ Backend failed"
curl -s http://localhost:5173 | grep -q "<title>Estoq" && echo "✓ Frontend OK: http://localhost:5173 (public: http://${PUBLIC_IP}:5173)" || echo "✗ Frontend failed (cek log)"
echo ""
echo "Akses public:"
echo "  Frontend: http://${PUBLIC_IP}:5173"
echo "  Backend:  http://${PUBLIC_IP}:3001/api/health"
