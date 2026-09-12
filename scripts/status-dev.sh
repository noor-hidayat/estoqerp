#!/bin/bash
PUBLIC_IP=$(curl -s --max-time 3 https://api.ipify.org || hostname -I | awk '{print $1}')
echo "=== EstoqERP Dev Status ==="
echo "Public IP: ${PUBLIC_IP}"
echo "Postgres: $(sudo systemctl is-active postgresql 2>&1 | head -1) ( $(pg_isready -h localhost 2>&1) )"
echo "Backend: $(curl -s http://localhost:3001/api/health 2>&1 || echo 'down') -> http://${PUBLIC_IP}:3001/api/health"
echo "Frontend: $(curl -s http://localhost:5173 -o /dev/null -w "%{http_code}" 2>&1) (http://localhost:5173 -> http://${PUBLIC_IP}:5173)"
echo "Frontend (public): $(curl -s http://${PUBLIC_IP}:5173 -o /dev/null -w "%{http_code}" 2>&1 | head -1) (http://${PUBLIC_IP}:5173)"
echo "Backend (public): $(curl -s http://${PUBLIC_IP}:3001/api/health 2>&1 | head -1) (http://${PUBLIC_IP}:3001/api/health)"
ps aux | grep -E "tsx|vite|concurrently" | grep -v grep | head -10
echo "Ports:"
ss -tulpn | grep -E "3001|5173"
echo "Logs: tail -f /tmp/estoqerp-dev.log"
echo "UFW:"
sudo ufw status numbered 2>&1 | head -n 20
