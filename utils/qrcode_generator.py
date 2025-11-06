import qrcode
from PIL import Image, ImageDraw
import os

# ============================================================
# 🎩 Gerador de QR Codes da Família (Automático)
# ============================================================

def gerar_qrcode_famiglia(base_url: str = None):
    """
    Gera automaticamente o QR Code dourado da Família,
    apontando para a versão mobile do site.
    """
    if base_url is None:
        base_url = os.getenv("FAMIGLIA_URL", "http://127.0.0.1:10000")

    url = f"{base_url.rstrip('/')}/mobile"
    output_path = "static/images/qrcode_famiglia.png"

    # Cria o QR Code básico
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=12,
        border=4,
    )
    qr.add_data(url)
    qr.make(fit=True)

    # Estilo: dourado sobre preto
    qr_img = qr.make_image(fill_color="gold", back_color="black").convert("RGB")

    # Moldura cinematográfica
    largura, altura = qr_img.size
    borda = 30
    imagem_final = Image.new("RGB", (largura + borda * 2, altura + borda * 2), "black")
    draw = ImageDraw.Draw(imagem_final)
    draw.rectangle(
        [5, 5, largura + borda * 2 - 5, altura + borda * 2 - 5],
        outline="gold",
        width=5
    )
    imagem_final.paste(qr_img, (borda, borda))

    # Salva o QR Code atualizado
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    imagem_final.save(output_path)
    print(f"✅ QR Code atualizado com sucesso: {output_path}")
    print(f"🔗 Link apontando para: {url}")
