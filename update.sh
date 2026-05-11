#!/bin/bash
set -euo pipefail

SERVER=${1:-}

if [[ -z "$SERVER" ]]; then
    echo "Использование: $0 user@server_ip"
    exit 1
fi

REMOTE_USER=${SERVER%@*}
REMOTE_DIR=${REMOTE_DIR:-/home/$REMOTE_USER/learn-helper}

RSYNC_EXCLUDES=(
    --exclude='node_modules'
    --exclude='.next'
    --exclude='dist'
    --exclude='.venv'
    --exclude='.git'
    --exclude='*.log'
    --exclude='.env'
)

echo "🔄 Быстрое обновление кода на $SERVER..."

rsync -avz "${RSYNC_EXCLUDES[@]}" ./ "$SERVER:$REMOTE_DIR/"

echo "🛠 Сборка и перезапуск..."
ssh -t "$SERVER" "cd '$REMOTE_DIR' && \
    (cd backend && npm run build) && \
    (cd frontend && npm run build) && \
    sudo systemctl restart learn-helper-backend learn-helper-frontend learn-helper-tts && \
    echo '✅ Обновление завершено!'"
