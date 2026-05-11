#!/bin/bash
set -euo pipefail

SERVER=${1:-}

SERVICES=(
    learn-helper-backend
    learn-helper-frontend
    learn-helper-tts
)

if [[ -z "$SERVER" || "$SERVER" == "local" || "$SERVER" == "localhost" ]]; then
    echo "🔄 Локальный перезапуск сервисов..."
    sudo systemctl restart "${SERVICES[@]}"
    sudo systemctl status "${SERVICES[@]}" --no-pager
else
    echo "🔄 Перезапуск сервисов на $SERVER..."
    ssh -t "$SERVER" "sudo systemctl restart ${SERVICES[*]} && sudo systemctl status ${SERVICES[*]} --no-pager"
fi

echo "✅ Сервисы перезапущены"
