#!/bin/bash
echo "Stopping EstoqERP dev..."
pkill -f "concurrently.*backend.*frontend" || true
pkill -f "tsx watch src/index.ts" || true
pkill -f "vite" || true
sleep 2
ss -tulpn | grep -E "3001|5173" || echo "✓ Stopped"
