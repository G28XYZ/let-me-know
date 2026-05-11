#!/bin/bash
set -euo pipefail

REMOTE_DIR=$(pwd)
REMOTE_USER=$(whoami)

if ! command -v node &> /dev/null; then
    echo "🔧 Установка Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

if command -v dpkg &> /dev/null && ! dpkg -l | grep -q python3-venv; then
    echo "🔧 Установка python3-venv..."
    sudo apt-get update && sudo apt-get install -y python3-venv
fi

echo "⚙️ Настройка Backend..."
cd backend
npm install
npm run build
cd ..

echo "⚙️ Настройка Frontend..."
cd frontend
npm install
npm run build
cd ..

echo "⚙️ Настройка TTS..."
cd tts
if [ ! -d ".venv" ]; then
    python3 -m venv .venv
fi
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
cd ..

echo "🔧 Настройка Systemd сервисов..."

cat > learn-helper-backend.service << SERVICE_EOF
[Unit]
Description=Learn Helper Backend
After=network.target

[Service]
User=$REMOTE_USER
WorkingDirectory=$REMOTE_DIR/backend
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SERVICE_EOF

cat > learn-helper-frontend.service << SERVICE_EOF
[Unit]
Description=Learn Helper Frontend
After=network.target

[Service]
User=$REMOTE_USER
WorkingDirectory=$REMOTE_DIR/frontend
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SERVICE_EOF

cat > learn-helper-tts.service << SERVICE_EOF
[Unit]
Description=Learn Helper TTS
After=network.target

[Service]
User=$REMOTE_USER
WorkingDirectory=$REMOTE_DIR/tts
Environment="PATH=$REMOTE_DIR/tts/.venv/bin"
ExecStart=$REMOTE_DIR/tts/.venv/bin/python main.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SERVICE_EOF

sudo mv learn-helper-backend.service /etc/systemd/system/
sudo mv learn-helper-frontend.service /etc/systemd/system/
sudo mv learn-helper-tts.service /etc/systemd/system/

sudo systemctl daemon-reload

sudo systemctl enable learn-helper-backend learn-helper-frontend learn-helper-tts
sudo systemctl restart learn-helper-backend learn-helper-frontend learn-helper-tts

echo "✅ Все сервисы запущены и настроены!"
