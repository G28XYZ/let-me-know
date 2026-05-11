.PHONY: all install dev dev-backend dev-frontend dev-tts build clean deploy update restart deploy-tts update-tts restart-tts

all: install dev

install:
	@echo "Installing backend dependencies..."
	cd backend && npm install
	@echo "Installing frontend dependencies..."
	cd frontend && npm install
	@echo "Installing tts dependencies..."
	cd tts && python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt

dev-backend:
	@echo "Starting backend..."
	cd backend && npm run dev

dev-frontend:
	@echo "Starting frontend..."
	cd frontend && npm run dev

dev-tts:
	@echo "Starting tts..."
	cd tts && source .venv/bin/activate && python3 main.py

dev:
	@echo "Starting backend, frontend and tts..."
	@$(MAKE) -j 3 dev-backend \
	dev-frontend
# 	dev-tts

TTS_SERVER ?=
SERVER ?=

# make deploy SERVER=user@ip
deploy:
	@echo "Deploying everything to $(SERVER)..."
	bash deploy.sh $(SERVER)

# make update SERVER=user@ip
update:
	@echo "Updating everything on $(SERVER)..."
	bash update.sh $(SERVER)

# make restart SERVER=user@ip
restart:
	@if [ -z "$(SERVER)" ]; then echo "Restarting services locally..."; else echo "Restarting services on $(SERVER)..."; fi
	bash restart.sh $(SERVER)

# make deploy-tts TTS_SERVER=user@ip
deploy-tts:
	@echo "Deploying TTS to $(TTS_SERVER)..."
	cd tts && bash deploy.sh $(TTS_SERVER)

# make update-tts TTS_SERVER=user@ip
update-tts:
	@echo "Updating TTS on $(TTS_SERVER)..."
	cd tts && bash update.sh $(TTS_SERVER)

# make restart-tts TTS_SERVER=user@ip
restart-tts:
	@if [ -z "$(TTS_SERVER)" ]; then echo "Restarting TTS locally..."; else echo "Restarting TTS on $(TTS_SERVER)..."; fi
	cd tts && bash restart.sh $(TTS_SERVER)

build:
	@echo "Building backend..."
	cd backend && npm run build
	@echo "Building frontend..."
	cd frontend && npm run build

clean:
	@echo "Cleaning node_modules..."
	rm -rf backend/node_modules
	rm -rf frontend/node_modules
	rm -rf backend/dist
	rm -rf frontend/.next
