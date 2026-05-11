#!/bin/bash
set -euo pipefail

SERVER=${1:-}
REMOTE_DIR=${REMOTE_DIR:-/home/aleksandr/learn-helper-tts}
REMOTE_SETUP="$REMOTE_DIR/.remote_setup.sh"

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

echo "🚀 Начинаем деплой TTS сервиса на $SERVER..."

echo "📦 Копирование файлов..."
ssh "$SERVER" "mkdir -p '$REMOTE_DIR'"
rsync -avz "${RSYNC_EXCLUDES[@]}" ./ "$SERVER:$REMOTE_DIR/"

echo "📝 Подготовка скрипта настройки..."
ssh "$SERVER" "cat > '$REMOTE_SETUP'" <<'REMOTE_EOF'
#!/bin/bash
set -euo pipefail

REMOTE_DIR=$(pwd)

REMOTE_USER=$(whoami)

echo "🔧 Установка зависимостей..."
if command -v apt-get &> /dev/null; then
    if ! dpkg -l | grep -q python3-venv; then
        sudo apt-get update && sudo apt-get install -y python3-venv
    fi
fi

if [ ! -d ".venv" ]; then
    python3 -m venv .venv
fi

source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

echo "⚙️ Настройка systemd сервиса..."
cat > learn-helper-tts.service << SERVICE_EOF
[Unit]
Description=Learn Helper TTS FastAPI Service
After=network.target

[Service]
User=$REMOTE_USER
WorkingDirectory=$REMOTE_DIR
Environment="PATH=$REMOTE_DIR/.venv/bin"
ExecStart=$REMOTE_DIR/.venv/bin/python main.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SERVICE_EOF

sudo mv learn-helper-tts.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable learn-helper-tts
sudo systemctl restart learn-helper-tts

echo "✅ Деплой завершен!"
REMOTE_EOF

echo "🛠 Запуск настройки на сервере (может потребоваться пароль sudo)..."
ssh -t "$SERVER" "cd '$REMOTE_DIR' && bash .remote_setup.sh; status=\$?; rm -f .remote_setup.sh; exit \$status"

echo "🏁 Все готово. Сервис доступен на порту 8000."
