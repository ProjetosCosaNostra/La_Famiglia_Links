# ============================================
# 🎬 LA FAMIGLIA LINKS — Video Generator
# Cria vídeos curtos de anúncios automáticos
# ============================================

from moviepy.editor import ImageClip, TextClip, CompositeVideoClip, AudioFileClip
from datetime import datetime
import os

def gerar_video_publicitario(titulo: str, descricao: str, imagem_base: str) -> str:
    """
    Gera automaticamente um vídeo curto de 9:16 (15s) com fade cinematográfico.
    """
    if not os.path.exists(imagem_base):
        raise FileNotFoundError(f"Imagem base não encontrada: {imagem_base}")

    os.makedirs("static/generated/videos", exist_ok=True)
    nome_arquivo = f"static/generated/videos/video_{datetime.now().strftime('%Y%m%d_%H%M%S')}.mp4"

    # Imagem base e duração
    clip = ImageClip(imagem_base, duration=15).resize(height=1920).resize(width=1080)

    # Título e descrição com estilo
    txt_titulo = TextClip(titulo, fontsize=80, color='gold', font='Arial-Bold', stroke_color='black', stroke_width=2)
    txt_desc = TextClip(descricao, fontsize=45, color='white', font='Arial', stroke_color='black', stroke_width=1)

    # Posições
    txt_titulo = txt_titulo.set_position(('center', 1400)).set_duration(15)
    txt_desc = txt_desc.set_position(('center', 1600)).set_duration(15)

    # Fade-in/fade-out
    clip = clip.fadein(1).fadeout(1)

    # Áudio de fundo (opcional)
    musica_padrao = "assets/audio/cinematic_bg.mp3"
    audio_clip = AudioFileClip(musica_padrao).volumex(0.3) if os.path.exists(musica_padrao) else None

    # Composição
    final = CompositeVideoClip([clip, txt_titulo, txt_desc])
    if audio_clip:
        final = final.set_audio(audio_clip)

    final.write_videofile(nome_arquivo, fps=30, codec="libx264", audio_codec="aac")

    print(f"✅ Vídeo publicitário criado: {nome_arquivo}")
    return nome_arquivo
