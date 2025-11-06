# business/media_ai/post_generator.py
import os
import io
import requests
from PIL import Image, ImageDraw, ImageFont
from datetime import datetime

ASSETS_DIR = "static/generated"
os.makedirs(ASSETS_DIR, exist_ok=True)

def _baixar_imagem(url: str) -> Image.Image:
    resp = requests.get(url, timeout=20)
    resp.raise_for_status()
    return Image.open(io.BytesIO(resp.content)).convert("RGB")

def _font(size=48):
    # Tenta Cinzel; cai para DejaVu se não houver
    possíveis = [
        "assets/fonts/Cinzel-VariableFont_wght.ttf",
        "assets/fonts/Cinzel-Regular.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    ]
    for p in possíveis:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size=size)
            except Exception:
                pass
    return ImageFont.load_default()

def gerar_banner_produto(nome: str, preco: float, image_url_or_path: str) -> str:
    """Gera banner vertical 1080x1350 com estética La Famiglia."""
    # Base 4:5
    W, H = 1080, 1350
    base = Image.new("RGB", (W, H), "black")
    draw = ImageDraw.Draw(base)

    # Moldura dourada
    draw.rectangle([10, 10, W-10, H-10], outline="gold", width=6)

    # Imagem do produto (quadrado central)
    try:
        if image_url_or_path.startswith("http"):
            img = _baixar_imagem(image_url_or_path)
        else:
            img = Image.open(image_url_or_path).convert("RGB")
    except Exception:
        # fallback: quadro neutro
        img = Image.new("RGB", (800, 800), "#111")

    # Enquadra imagem em 900x900
    box_size = 900
    img.thumbnail((box_size, box_size))
    pad = (W - img.width) // 2
    top = 140
    base.paste(img, (pad, top))

    # Tipografia
    f_title = _font(56)
    f_price = _font(50)
    f_small = _font(28)

    # Título (quebra simples)
    titulo = nome[:48] + ("…" if len(nome) > 48 else "")
    tw, th = draw.textbbox((0,0), titulo, font=f_title)[2:]
    draw.text(((W - tw)//2, 30), titulo, font=f_title, fill="gold")

    # Preço
    preco_txt = f"R$ {preco:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    pw, ph = draw.textbbox((0,0), preco_txt, font=f_price)[2:]
    draw.text(((W - pw)//2, H - ph - 120), preco_txt, font=f_price, fill="gold")

    # Assinatura
    sig = "La Famiglia Links"
    sw, sh = draw.textbbox((0,0), sig, font=f_small)[2:]
    draw.text(((W - sw)//2, H - sh - 48), sig, font=f_small, fill="#d4af37")

    # Salvar
    fname = f"banner_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.jpg"
    out_path = os.path.join(ASSETS_DIR, fname)
    base.save(out_path, quality=92)
    return out_path
