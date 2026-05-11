import torch
import soundfile as sf

device = torch.device("cpu")

model, _ = torch.hub.load(
    repo_or_dir="snakers4/silero-models",
    model="silero_tts",
    language="ru",
    speaker="v5_5_ru",
    trust_repo=True
)

model.to(device)

def create_audio(text: str):
	audio = model.apply_tts(
			text=text,
			speaker="baya",
			sample_rate=48000
	)

	sf.write("/app/output/output.wav", audio, 48000)
	print("Готово: /app/output/output.wav")