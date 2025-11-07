# ============================================
# 🎩 LA FAMIGLIA LINKS — Flask Principal
# Hub dinâmico + IA + Painéis + Admin
# ============================================

import os
from flask import Flask, render_template, jsonify
from flask_cors import CORS

# ============================================
# 🏛️ Inicialização da Aplicação
# ============================================
app = Flask(__name__)
CORS(app)

# ============================================
# 🧱 Banco de Dados — Inicialização Segura
# ============================================
try:
    from models.database import init_db, create_default_admin
    init_db()
    create_default_admin()
    print("✅ Banco e admin da Família prontos.")
except Exception as e:
    print(f"⚠️ Banco não inicializado automaticamente: {e}")

# ============================================
# 🔹 Importações Principais
# ============================================
auth_bp = None
try:
    from auth import auth_bp
except Exception as e:
    print(f"⚠️ Módulo de autenticação indisponível: {e}")

try:
    from routes.ia_routes import ia_bp
    from routes.links_routes import links_bp
    from models.links_model import listar_links
except Exception as e:
    print(f"⚠️ Falha ao importar rotas principais: {e}")

# ============================================
# 🔹 Importação Segura dos Módulos de Negócio
# ============================================
def safe_import(module_name, bp_name):
    try:
        module = __import__(module_name, fromlist=[bp_name])
        return getattr(module, bp_name)
    except Exception as e:
        print(f"⚠️ Falha ao registrar {module_name}: {e}")
        return None

trends_bp = safe_import("business.trends.routes", "trends_bp")
payments_bp = safe_import("business.payments.routes", "payments_bp")
affiliates_bp = safe_import("business.affiliates.routes", "affiliates_bp")
media_bp = safe_import("business.media_ai.routes", "media_bp")
autopost_bp = safe_import("business.autopost.routes", "autopost_bp")
affiliates_intel_bp = safe_import("business.affiliates_intel.routes", "affiliates_intel_bp")
reports_bp = safe_import("business.reports.routes", "reports_bp")

# ============================================
# 🔗 Registro dos Blueprints
# ============================================
if auth_bp:
    app.register_blueprint(auth_bp, url_prefix="/auth")
else:
    print("⚠️ Blueprint /auth não foi registrado (módulo ausente).")

if ia_bp: app.register_blueprint(ia_bp, url_prefix="/api")
if links_bp: app.register_blueprint(links_bp, url_prefix="/links")
if trends_bp: app.register_blueprint(trends_bp, url_prefix="/business/trends")
if payments_bp: app.register_blueprint(payments_bp, url_prefix="/business/payments")
if affiliates_bp: app.register_blueprint(affiliates_bp, url_prefix="/business/affiliates")
if media_bp: app.register_blueprint(media_bp, url_prefix="/business/media")
if autopost_bp: app.register_blueprint(autopost_bp, url_prefix="/business/autopost")
if affiliates_intel_bp: app.register_blueprint(affiliates_intel_bp, url_prefix="/business/affiliates_intel")
if reports_bp: app.register_blueprint(reports_bp, url_prefix="/business/reports")

print("✅ Blueprints registrados com sucesso.")

# ============================================
# 🏠 Rotas Principais — Hub & Mobile
# ============================================
@app.route("/")
def home():
    """Página principal com fallback garantido."""
    try:
        from models.links_model import listar_links
        links = listar_links()
    except Exception as e:
        print(f"⚠️ Falha ao listar links: {e}")
        links = []

    try:
        return render_template("index.html", links=links)
    except Exception as e:
        print(f"⚠️ Falha ao renderizar index.html: {e}")
        return """
        <html>
            <head><title>La Famiglia Links</title></head>
            <body style='background:black;color:gold;text-align:center;font-family:Arial'>
                <h1>🎩 La Famiglia Links</h1>
                <p>O hub está online, Don. Mas o <b>template principal</b> ainda não foi carregado.</p>
            </body>
        </html>
        """, 200


@app.route("/mobile")
def mobile():
    """Versão 9:16 para QR, reels e stories."""
    try:
        from models.links_model import listar_links
        links = listar_links()
        return render_template("mobile/index_mobile.html", links=links)
    except Exception as e:
        print(f"⚠️ Falha na rota /mobile: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/healthz")
def healthz():
    """Endpoint para verificação de saúde."""
    return jsonify({"status": "ok"}), 200

# ============================================
# 📅 Schedulers — Ativação Condicional
# ============================================
if os.getenv("ENABLE_SCHEDULERS", "false").lower() == "true":
    try:
        from backend.scheduler_job import iniciar_scheduler
        iniciar_scheduler()
        print("⚙️ Scheduler principal ativo.")
    except Exception as e:
        print(f"⚠️ Falha ao iniciar scheduler principal: {e}")

# ============================================
# 📱 QR Code Automático (Startup)
# ============================================
try:
    from utils.qrcode_generator import gerar_qrcode_famiglia
    base_url = (
        os.getenv("FAMIGLIA_URL")
        or os.getenv("RENDER_EXTERNAL_URL")
        or "http://127.0.0.1:10000"
    )
    gerar_qrcode_famiglia(base_url)
    print("✅ QR Code atualizado com sucesso.")
except Exception as e:
    print(f"⚠️ Falha ao gerar QR Code: {e}")

# ============================================
# 🚀 Execução Local
# ============================================
if __name__ == "__main__":
    port = int(os.getenv("PORT", "10000"))
    print(f"🚀 Iniciando servidor na porta {port} ...")
    app.run(host="0.0.0.0", port=port, debug=False)
