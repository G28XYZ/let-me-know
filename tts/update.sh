#!/bin/bash
set -euo pipefail

SERVER=${1:-}
REMOTE_DIR=${REMOTE_DIR:-/home/aleksandr/learn-helper-tts}

RSYNC_EXCLUDES=(
    --exclude='.venv'
    --exclude='__pycache__'
    --exclude='.git'
    --exclude='remote_setup.sh'
)

if [[ -z "$SERVER" ]]; then
    echo "Использование: $0 user@server_ip"
    echo "Пример: $0 root@192.168.1.100"
    exit 1
fi

echo "🔄 Обновление кода TTS сервиса на $SERVER..."

echo "📦 Копирование файлов..."
rsync -avz "${RSYNC_EXCLUDES[@]}" ./ "$SERVER:$REMOTE_DIR/"

echo '✅ Код обновлен'
