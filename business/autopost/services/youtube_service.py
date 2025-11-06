# business/autopost/services/youtube_service.py
import os

YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY", "")

def post_short(video_path: str, caption: str):
    """
    Simula o upload de um Short no YouTube.
    Em produção, será feita via YouTube Data API v3.
    """
    print(f"📺 [YOUTUBE] Upload de Short: {video_path}")
    print(f"Legenda: {caption}")
    if not YOUTUBE_API_KEY:
        print("⚠️ API Key do YouTube não configurada (simulado).")
    return {"ok": True, "simulado": True, "rede": "youtube", "arquivo": video_path}
