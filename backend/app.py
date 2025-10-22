import os
import sqlite3
from flask import Flask, jsonify
from flask_cors import CORS
from routes.links import links_bp
from routes.analytics import analytics_bp
from routes.automacao import automacao_bp
app.register_blueprint(automacao_bp)

from utils.notifier import notify_event
from apscheduler.schedulers.background import BackgroundScheduler
from datetime import datetime

BASE_DIR = os.path.dirname(__file__)
DB_PATH = os.path.join(BASE_DIR, "familia.db")

def create_app():
    app = Flask(__name__, static_folder=None)
    CORS(app)
    app.config['SECRET_KEY'] = os.getenv("SECRET_KEY", "troque_essa_chave")
    return app

app = create_app()

# --- Database init (idempotent) ---
def init_db():
    if not os.path.exists(DB_PATH):
        print("🔧 Criando banco de dados...")
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE links (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                titulo TEXT,
                url TEXT,
                plataforma TEXT,
                category TEXT,
                priority INTEGER DEFAULT 1,
                created_at TEXT
            )
        """)
        conn.commit()
        conn.close()
        print("✅ Banco de dados criado.")
    else:
        # possível lugar para migrations futuras
        pass

init_db()

# --- Registrar blueprints ---
app.register_blueprint(links_bp, url_prefix="/links")
app.register_blueprint(analytics_bp, url_prefix="/analytics")
app.register_blueprint(automacao_bp, url_prefix="/api")

@app.route("/")
def index():
    return jsonify({"mensagem": "🎩 Cosa Nostra — API Online!", "time": datetime.utcnow().isoformat()})

# --- Scheduler para tarefas long-running (ex.: criar posts, checar tendências) ---
scheduler = BackgroundScheduler()
scheduler.start()

# Exemplo: rotina leve para notificar que app está vivo (executa a cada 6 horas)
def heartbeat():
    notify_event("ai_task", "Heartbeat — Cosa Nostra rodando (scheduler).")

scheduler.add_job(heartbeat, 'interval', hours=6, id="heartbeat_job", replace_existing=True)

# --- Stop scheduler on shutdown (Gunicorn friendly) ---
import atexit
atexit.register(lambda: scheduler.shutdown(wait=False))

if __name__ == "__main__":
    # uso local de desenvolvimento
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", 5000)), debug=False)
