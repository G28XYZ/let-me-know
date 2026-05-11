#!/bin/bash
set -euo pipefail

SERVER=${1:-}

if [[ -z "$SERVER" || "$SERVER" == "local" || "$SERVER" == "localhost" ]]; then
    echo "🔄 Локальный перезапуск TTS сервиса..."
    sudo systemctl restart learn-helper-tts
    sudo systemctl status learn-helper-tts --no-pager
else
    echo "🔄 Перезапуск TTS сервиса на $SERVER..."
    ssh -t "$SERVER" "sudo systemctl restart learn-helper-tts && sudo systemctl status learn-helper-tts --no-pager"
fi

echo "✅ TTS сервис перезапущен"
