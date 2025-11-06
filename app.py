# ============================================
# 🎩 LA FAMIGLIA LINKS — Flask Principal
# Hub dinâmico + IA + Painéis + Admin
# ============================================

import os
from flask import Flask, render_template, jsonify
from flask_cors import CORS

# ============================================================
# 🧱 Inicialização do banco de dados na primeira execução
# ============================================================
try:
    from models.database import init_db
    init_db()
    print("✅ Banco de dados inicializado com sucesso.")
except Exception as e:
    print(f"⚠️ Banco não inicializado automaticamente: {e}")

# ============================================================
# 🔹 Importações principais
# ============================================================
from routes.ia_routes import ia_bp
from routes.links_routes import links_bp
from models.links_model import listar_links
from auth import auth_bp

# ============================================================
# 🔹 Módulos de Negócio
# ============================================================
from business.trends.routes import trends_bp
from business.payments.routes import payments_bp
from business.affiliates.routes import affiliates_bp
from business.media_ai.routes import media_bp
from business.autopost.routes import autopost_bp
from business.reports.routes import reports_bp

# Inteligência de Afiliados (IA + coleta automática)
try:
    from business.affiliates_intel.routes import affiliates_intel_bp
except ModuleNotFoundError:
    affiliates_intel_bp = None

# Painel Business (opcional)
try:
    from business.dashboard.routes import business_bp
except ModuleNotFoundError:
    business_bp = None

# ============================================================
# 🧱 Inicialização da aplicação Flask
# ============================================================
app = Flask(__name__)
CORS(app)

# ============================================================
# 🔗 Registro de Blueprints
# ============================================================
app.register_blueprint(auth_bp, url_prefix="/auth")
app.register_blueprint(ia_bp, url_prefix="/api")
app.register_blueprint(links_bp, url_prefix="/links")
app.register_blueprint(trends_bp, url_prefix="/business/trends")
app.register_blueprint(payments_bp, url_prefix="/business/payments")
app.register_blueprint(affiliates_bp, url_prefix="/business/affiliates")
app.register_blueprint(media_bp, url_prefix="/business/media")
app.register_blueprint(autopost_bp, url_prefix="/business/autopost")
app.register_blueprint(reports_bp, url_prefix="/business/reports")

# 🔹 Inteligência de Afiliados (IA + Coleta automática)
if affiliates_intel_bp:
    app.register_blueprint(affiliates_intel_bp, url_prefix="/business/affiliates_intel")

# 🔹 Painel Administrativo (Dashboard)
if business_bp:
    app.register_blueprint(business_bp, url_prefix="/business")

# ============================================================
# 🏛️ Rotas principais — Hub & Mobile
# ============================================================
@app.route("/")
def home():
    """Página principal com os links dinâmicos da Família."""
    links = listar_links()
    return render_template("index.html", links=links)

@app.route("/mobile")
def mobile():
    """Versão mobile (9:16) — ideal para QR, reels e stories."""
    links = listar_links()
    return render_template("mobile/index_mobile.html", links=links)

@app.route("/healthz")
def healthz():
    """Health-check para Render e monitoramento."""
    return jsonify({"status": "ok"}), 200

# ============================================================
# 🕰️ Inicialização de Schedulers (IA, AutoPost, Afiliados, Mídia)
# ============================================================
try:
    from backend.scheduler_job import iniciar_scheduler
    iniciar_scheduler()
    print("⚙️ Scheduler principal ativo.")
except Exception as e:
    print(f"⚠️ Falha ao iniciar scheduler principal: {e}")

try:
    from business.autopost.scheduler import iniciar_autopost_scheduler
    iniciar_autopost_scheduler()
    print("📢 Scheduler AutoPost ativo.")
except Exception as e:
    print(f"⚠️ Falha ao iniciar AutoPost Scheduler: {e}")

try:
    from business.affiliates_intel.scheduler import iniciar_affiliates_scheduler
    iniciar_affiliates_scheduler()
    print("🤖 Scheduler de Afiliados Inteligentes ativo.")
except Exception as e:
    print(f"⚠️ Falha ao iniciar Scheduler de Afiliados: {e}")

try:
    from business.media_ai.scheduler_media import iniciar_scheduler_midia
    iniciar_scheduler_midia()
    print("🎬 Scheduler de Mídia IA ativo (banners + vídeos automáticos).")
except Exception as e:
    print(f"⚠️ Falha ao iniciar Scheduler de Mídia IA: {e}")

# ============================================================
# 📱 Geração Automática do QR Code (startup)
# ============================================================
try:
    from utils.qrcode_generator import gerar_qrcode_famiglia
    base_url = (
        os.getenv("FAMIGLIA_URL")
        or os.getenv("RENDER_EXTERNAL_URL")
        or "http://127.0.0.1:10000"
    )
    gerar_qrcode_famiglia(base_url)
    print("📱 QR Code da Família atualizado com sucesso.")
except Exception as e:
    print(f"⚠️ Falha ao gerar QR Code: {e}")

# ============================================================
# 🚀 Execução Local
# ============================================================
if __name__ == "__main__":
    port = int(os.getenv("PORT", "10000"))
    print(f"🚀 Servidor La Famiglia Links rodando em http://127.0.0.1:{port}")
    app.run(host="0.0.0.0", port=port, debug=False)
