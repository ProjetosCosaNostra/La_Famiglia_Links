# business/media_ai/scheduler_ads.py
# ============================================
# 🎬 Gerador de BANNERS automáticos (estilo La Famiglia)
# Sem dependência pesada de IA — usa Pillow (estável no Render)
# ============================================

import os
import sqlite3
from datetime import datetime
from PIL import Image, ImageDraw, ImageFont

# Opção: ativar scheduler por variável
ENABLE_AD_SCHEDULER = os.getenv("ENABLE_AD_SCHEDULER", "true").lower() == "true"

try:
    from apscheduler.schedulers.background import BackgroundScheduler
except Exception:
    BackgroundScheduler = None

# --------------------------------------------
# 🧱 Banco
# --------------------------------------------
def _db_path():
    base = os.getenv("DATABASE_DIR", "/data")
    if not os.path.isdir(base):
        base = "data"
    os.makedirs(base, exist_ok=True)
    return os.path.join(base, "database.db")

def _conn():
    return sqlite3.connect(_db_path(), check_same_thread=False)

def _ensure_tables():
    con = _conn()
    cur = con.cursor()
    # Tabela de produtos afiliados (fonte para anúncios)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS affiliates_products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source TEXT,                 -- AMAZON | ML
            title TEXT,
            price TEXT,
            url TEXT,
            image_url TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
    """)
    # Tabela de anúncios (banners) gerados
    cur.execute("""
        CREATE TABLE IF NOT EXISTS media_ads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_title TEXT,
            copy TEXT,
            banner_path TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
    """)
    con.commit()
    con.close()

_ensure_tables()

# --------------------------------------------
# 🎨 Estilo La Famiglia
# --------------------------------------------
def _load_font(size=48):
    # Tentativas de fontes padrão do sistema/contêiner
    possible = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/freefont/FreeSerif.ttf",
    ]
    for p in possible:
        if os.path.isfile(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()

def _make_copy(title: str, price: str) -> str:
    # Frases curtas e cinematográficas
    base = "Honra. Poder. Estratégia."
    if price:
        return f"{title}\n{base}\nPor {price}"
    return f"{title}\n{base}"

def _draw_banner(product_title: str, price: str, out_path: str):
    W, H = 1080, 1350  # formato vertical (4:5) ideal p/ feeds
    img = Image.new("RGB", (W, H), color=(0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Moldura dourada
    draw.rectangle([30, 30, W-30, H-30], outline=(212,175,55), width=6)

    # Título/Copy
    title_font = _load_font(72)
    body_font  = _load_font(40)
    copy = _make_copy(product_title, price)

    # Centralização vertical simples
    text_w, text_h = draw.multiline_textsize(copy, font=title_font, spacing=10)
    x = (W - text_w) // 2
    y = (H - text_h) // 2 - 100
    draw.multiline_text((x, y), copy, font=title_font, fill=(212,175,55), align="center", spacing=10)

    # Assinatura
    sig = "⚜️ La Famiglia Links"
    sig_w, sig_h = draw.textsize(sig, font=body_font)
    draw.text((W - sig_w - 50, H - sig_h - 60), sig, font=body_font, fill=(212,175,55))

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    img.save(out_path, quality=95)

def _insert_media(product_title: str, copy: str, banner_path: str):
    con = _conn()
    cur = con.cursor()
    cur.execute("""
        INSERT INTO media_ads (product_title, copy, banner_path, created_at)
        VALUES (?, ?, ?, ?);
    """, (product_title, copy, banner_path, datetime.utcnow().isoformat()))
    con.commit()
    con.close()

# --------------------------------------------
# 🔁 Lógica: escolhe produto e gera banner
# --------------------------------------------
def _pick_product():
    con = _conn()
    cur = con.cursor()
    cur.execute("""
        SELECT title, price, url
        FROM affiliates_products
        ORDER BY id DESC
        LIMIT 1;
    """)
    row = cur.fetchone()
    con.close()
    if not row:
        # Produto padrão fallback
        return {
            "title": "Relógio Dourado — Edição Capo",
            "price": "R$ 199,90",
            "url": "https://la-famiglia-links.onrender.com/"
        }
    return {"title": row[0], "price": row[1] or "", "url": row[2] or ""}

def gerar_banner_automatico():
    prod = _pick_product()
    title = (prod["title"] or "Produto Selecionado")[:60]
    price = prod["price"] or ""
    copy = _make_copy(title, price)
    out_dir = "static/generated/banners"
    out_path = os.path.join(out_dir, f"banner_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.jpg")
    _draw_banner(title, price, out_path)
    _insert_media(title, copy, out_path)
    return out_path

# --------------------------------------------
# ⏰ Scheduler (diário às 10:00, se habilitado)
# --------------------------------------------
_scheduler = None

def start_scheduler_if_enabled():
    global _scheduler
    if not ENABLE_AD_SCHEDULER or BackgroundScheduler is None:
        print("ℹ️ Banner scheduler desativado ou APScheduler indisponível.")
        return
    if _scheduler:
        return
    _scheduler = BackgroundScheduler()
    # Todos os dias às 10:00 UTC (ajuste se quiser horário BR)
    _scheduler.add_job(gerar_banner_automatico, "cron", hour=10, minute=0)
    _scheduler.start()
    print("⚙️ Banner scheduler iniciado — anúncios automáticos ativos.")
