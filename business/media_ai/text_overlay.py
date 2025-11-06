# ============================================
# 🎨 LA FAMIGLIA LINKS — Text Overlay IA
# Gera banners cinematográficos com texto dourado
# ============================================

from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os
from datetime import datetime

def gerar_banner_com_texto(imagem_base: str, titulo: str, descricao: str) -> str:
    """
    Gera um banner cinematográfico com texto dourado sobre a imagem.
    """
    if not os.path.exists(imagem_base):
        raise FileNotFoundError(f"Imagem não encontrada: {imagem_base}")

    # Carrega imagem base
    img = Image.open(imagem_base).convert("RGB").resize((1080, 1350))
    draw = ImageDraw.Draw(img)

    # Fonte padrão (substitua se quiser fontes cinematográficas)
    try:
        fonte_titulo = ImageFont.truetype("arial.ttf", 60)
        fonte_desc = ImageFont.truetype("arial.ttf", 36)
    except:
        fonte_titulo = ImageFont.load_default()
        fonte_desc = ImageFont.load_default()

    # Gradiente dourado sutil
    gradiente = Image.new("RGBA", img.size, (0, 0, 0, 180))
    img = Image.alpha_composite(img.convert("RGBA"), gradiente)

    # Texto centralizado
    largura, altura = img.size
    x_centro = largura // 2

    # Título
    tw, th = draw.textsize(titulo, font=fonte_titulo)
    draw.text((x_centro - tw // 2, altura - 350), titulo, fill="#FFD700", font=fonte_titulo)

    # Descrição
    dw, dh = draw.textsize(descricao, font=fonte_desc)
    draw.text((x_centro - dw // 2, altura - 260), descricao, fill="#E0C46C", font=fonte_desc)

    # Moldura dourada
    draw.rectangle([10, 10, largura - 10, altura - 10], outline="#FFD700", width=5)

    # Suaviza e salva
    banner = img.filter(ImageFilter.SMOOTH_MORE)

    os.makedirs("static/generated/banners", exist_ok=True)
    nome_arquivo = f"static/generated/banners/banner_{datetime.now().strftime('%Y%m%d_%H%M%S')}.jpg"
    banner.convert("RGB").save(nome_arquivo, "JPEG", quality=95)

    print(f"✅ Banner gerado: {nome_arquivo}")
    return nome_arquivo
