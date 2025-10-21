# ==============================================
# 🎩 COSA NOSTRA - SCHEDULER ROUTE
# ==============================================
from flask import Blueprint, request, jsonify
import sqlite3, threading, time, datetime
from pathlib import Path
from utils.helpers import gerar_post_automatico

scheduler_bp = Blueprint("scheduler", __name__)
DB_PATH = Path(__file__).resolve().parents[1] / "famiglia.db"

# Variável de controle
scheduler_active = {"interval": 24, "running": False}

def gerar_posts_periodicamente():
    while scheduler_active["running"]:
        try:
            qtd_posts = scheduler_active.get("qtd_posts", 1)
            for _ in range(qtd_posts):
                gerar_post_automatico()
            print(f"[{datetime.datetime.now()}] ✅ {qtd_posts} post(s) automático(s) criado(s).")
        except Exception as e:
            print(f"❌ Erro ao gerar posts: {e}")
        time.sleep(scheduler_active["interval"] * 3600)  # intervalo em horas

@scheduler_bp.route("/api/scheduler", methods=["POST"])
def configurar_scheduler():
    data = request.get_json()
    qtd = int(data.get("qtd_posts", 1))
    intervalo = int(data.get("intervalo", 24))
    ativo = data.get("ativo", False)

    scheduler_active["interval"] = intervalo
    scheduler_active["qtd_posts"] = qtd

    if ativo and not scheduler_active["running"]:
        scheduler_active["running"] = True
        t = threading.Thread(target=gerar_posts_periodicamente, daemon=True)
        t.start()
        msg = f"⏱️ Gerador iniciado — {qtd} posts a cada {intervalo}h."
    elif not ativo:
        scheduler_active["running"] = False
        msg = "🛑 Gerador automático pausado."
    else:
        msg = "⚙️ Gerador já está ativo."

    return jsonify({"status": "ok", "message": msg})
