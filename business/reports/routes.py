# ============================================
# 📊 LA FAMIGLIA LINKS — Módulo de Relatórios
# Gera estatísticas e métricas em tempo real
# ============================================

from flask import Blueprint, render_template, jsonify
from datetime import datetime
import os

from models.database import get_db_connection

reports_bp = Blueprint("reports_bp", __name__, template_folder="templates")

# ============================================================
# 📈 1️⃣ RELATÓRIOS HTML — Painel visual
# ============================================================
@reports_bp.route("/")
def reports_dashboard():
    """
    Exibe as métricas principais no painel da Família.
    """
    conn = get_db_connection()
    cur = conn.cursor()

    # Contagens principais
    cur.execute("SELECT COUNT(*) FROM links")
    total_links = cur.fetchone()[0] if cur else 0

    cur.execute("SELECT COUNT(*) FROM users")
    total_users = cur.fetchone()[0] if cur else 0

    try:
        cur.execute("SELECT COUNT(*) FROM banners")
        total_banners = cur.fetchone()[0]
    except:
        total_banners = 0

    try:
        cur.execute("SELECT COUNT(*) FROM videos")
        total_videos = cur.fetchone()[0]
    except:
        total_videos = 0

    conn.close()

    return render_template(
        "reports_dashboard.html",
        total_links=total_links,
        total_users=total_users,
        total_banners=total_banners,
        total_videos=total_videos,
        timestamp=datetime.now().strftime("%d/%m/%Y %H:%M"),
    )

# ============================================================
# 🧠 2️⃣ RELATÓRIOS JSON — API de dados
# ============================================================
@reports_bp.route("/api")
def reports_api():
    """
    Retorna as métricas principais em formato JSON.
    """
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("SELECT COUNT(*) FROM links")
        total_links = cur.fetchone()[0]
    except:
        total_links = 0

    try:
        cur.execute("SELECT COUNT(*) FROM users")
        total_users = cur.fetchone()[0]
    except:
        total_users = 0

    try:
        cur.execute("SELECT COUNT(*) FROM banners")
        total_banners = cur.fetchone()[0]
    except:
        total_banners = 0

    try:
        cur.execute("SELECT COUNT(*) FROM videos")
        total_videos = cur.fetchone()[0]
    except:
        total_videos = 0

    conn.close()

    return jsonify({
        "ok": True,
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "links": total_links,
        "users": total_users,
        "banners": total_banners,
        "videos": total_videos
    })

# ============================================================
# 💬 3️⃣ STATUS RÁPIDO
# ============================================================
@reports_bp.route("/status")
def status():
    """
    Status rápido do módulo de relatórios.
    """
    return jsonify({
        "ok": True,
        "status": "online",
        "time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "env": os.getenv("FLASK_ENV", "production")
    })
