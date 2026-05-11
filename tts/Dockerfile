FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir \
    torch \
    torchaudio \
    omegaconf \
    numpy \
    soundfile

COPY tts.py .

CMD ["python", "tts.py"]
