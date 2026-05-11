from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import torch
import soundfile as sf
import io

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

device = torch.device("cpu")

print("Loading Silero TTS model...")
model, _ = torch.hub.load(
    repo_or_dir="snakers4/silero-models",
    model="silero_tts",
    language="ru",
    speaker="v5_5_ru",
    trust_repo=True
)
model.to(device)
print("Model loaded successfully.")

class TTSRequest(BaseModel):
    text: str
    speaker: str = "baya"

import re

def clean_text_for_tts(text: str):
    # Replace common problematic characters
    text = text.replace("—", "-").replace("–", "-")
    text = text.replace("«", "\"").replace("»", "\"")
    text = text.replace("„", "\"").replace("“", "\"")
    text = text.replace("©", "(c)").replace("®", "(r)")
    
    # Remove unsupported special symbols but keep basic punctuation
    # Silero Russian model primarily supports: а-я, А-Я, ё, Ё, 0-9, and basic punctuation
    text = re.sub(r'[^а-яА-ЯёЁa-zA-Z0-9\s.,!?;:\-()"\']', ' ', text)
    
    # Collapse multiple spaces
    text = re.sub(r'\s+', ' ', text).strip()
    return text

import base64

@app.post("/api/tts")
def generate_tts(req: TTSRequest):
    try:
        cleaned_text = clean_text_for_tts(req.text)
        if not cleaned_text:
            return Response(content="Text is empty after cleaning", status_code=400)

        # Split text into chunks to avoid Silero length limit
        sentences = re.split(r'(?<=[.!?])\s+', cleaned_text)
        audio_chunks = []
        timecodes = []
        current_time = 0.0
        
        current_chunk_text = ""
        
        def process_chunk(text):
            nonlocal current_time
            text = text.strip()
            if not text:
                return
            
            # Generate audio for the whole sentence/chunk to keep natural prosody
            audio = model.apply_tts(text=text, speaker=req.speaker, sample_rate=48000)
            duration = len(audio) / 48000.0
            audio_chunks.append(audio)
            
            # Split the text into smaller word groups for granular timecodes
            words = text.split()
            if not words:
                return
            
            # Target ~3 words per highlight group
            chunk_size = 3
            groups = [" ".join(words[i:i + chunk_size]) for i in range(0, len(words), chunk_size)]
            
            # Distribute total duration among groups proportionally to their character length
            total_chars = sum(len(g) for g in groups)
            if total_chars == 0:
                return
                
            group_start = current_time
            for group in groups:
                group_dur = (len(group) / total_chars) * duration
                timecodes.append({
                    "text": group,
                    "start": round(group_start, 3),
                    "end": round(group_start + group_dur, 3)
                })
                group_start += group_dur
                
            current_time += duration

        for sentence in sentences:
            if len(current_chunk_text) + len(sentence) < 700:
                current_chunk_text += " " + sentence
            else:
                process_chunk(current_chunk_text)
                current_chunk_text = sentence
                
        process_chunk(current_chunk_text)
            
        if not audio_chunks:
            return Response(content="No audio generated", status_code=400)
            
        # Concatenate audio chunks
        final_audio = torch.cat(audio_chunks, dim=0)
        
        buffer = io.BytesIO()
        sf.write(buffer, final_audio.numpy(), 48000, format='WAV')
        
        audio_base64 = base64.b64encode(buffer.getvalue()).decode('utf-8')
        
        return {
            "audio": f"data:audio/wav;base64,{audio_base64}",
            "timecodes": timecodes
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        return Response(content=str(e), status_code=500)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)