# business/autopost/services/instagram_service.py
import os

# Para integração real, precisaremos do access_token e da page_id (ou user_id)
INSTAGRAM_TOKEN = os.getenv("INSTAGRAM_TOKEN", "")
INSTAGRAM_USER_ID = os.getenv("INSTAGRAM_USER_ID", "")

def post_image(image_path: str, caption: str):
    """
    Simula a postagem de imagem no Instagram.
    Em produção, usará a API do Meta Graph.
    """
    print(f"📸 [INSTAGRAM] Publicando imagem: {image_path}")
    print(f"Legenda: {caption}")
    if not INSTAGRAM_TOKEN:
        print("⚠️ Token do Instagram não configurado (simulado).")
    return {"ok": True, "simulado": True, "rede": "instagram", "arquivo": image_path}

def post_video(video_path: str, caption: str):
    """
    Simula a postagem de vídeo no Instagram.
    """
    print(f"🎞️ [INSTAGRAM] Publicando vídeo: {video_path}")
    print(f"Legenda: {caption}")
    if not INSTAGRAM_TOKEN:
        print("⚠️ Token do Instagram não configurado (simulado).")
    return {"ok": True, "simulado": True, "rede": "instagram", "arquivo": video_path}
