# business/autopost/services/kwai_service.py
import os

KWAI_TOKEN = os.getenv("KWAI_TOKEN", "")

def post_video(video_path: str, caption: str):
    """
    Simula postagem no Kwai.
    A API real do Kwai usa tokens OAuth2.
    """
    print(f"🎬 [KWAI] Upload de vídeo: {video_path}")
    print(f"Legenda: {caption}")
    if not KWAI_TOKEN:
        print("⚠️ Token do Kwai não configurado (simulado).")
    return {"ok": True, "simulado": True, "rede": "kwai", "arquivo": video_path}
