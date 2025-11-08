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
# 🔹 Importações Seguras (helper)
# ============================================
def safe_import_bp(module_name, bp_name):
    """Importa Blueprints de forma segura, sem travar o app."""
    try:
        module = __import__(module_name, fromlist=[bp_name])
        bp = getattr(module, bp_name)
        print(f"✅ Blueprint carregado: {module_name}")
        return bp
    except Exception as e:
        print(f"⚠️ Falha ao importar {module_name}: {e}")
        return None

def register_blueprint_if_exists(bp, prefix):
    if bp:
        app.register_blueprint(bp, url_prefix=prefix)
        print(f"🔗 Rota registrada: {prefix}")
    else:
        print(f"⚠️ Blueprint ausente: {prefix}")

# ============================================
# 🔗 Blueprints principais
# ============================================
auth_bp  = safe_import_bp("auth", "auth_bp")
ia_bp    = safe_import_bp("routes.ia_routes", "ia_bp")
links_bp = safe_import_bp("routes.links_routes", "links_bp")

register_blueprint_if_exists(auth_bp,  "/auth")
register_blueprint_if_exists(ia_bp,    "/api")
register_blueprint_if_exists(links_bp, "/links")

# ============================================
# 🔗 Blueprints de negócio
# ============================================
trends_bp          = safe_import_bp("business.trends.routes", "trends_bp")
payments_bp        = safe_import_bp("business.payments.routes", "payments_bp")
affiliates_bp      = safe_import_bp("business.affiliates.routes", "affiliates_bp")
media_bp           = safe_import_bp("business.media_ai.routes", "media_bp")
autopost_bp        = safe_import_bp("business.autopost.routes", "autopost_bp")
affiliates_intel_bp= safe_import_bp("business.affiliates_intel.routes", "affiliates_intel_bp")
reports_bp         = safe_import_bp("business.reports.routes", "reports_bp")

# ✅ Novo: verificação Stripe (webhook + status)
payments_verify_bp = safe_import_bp("business.payments.verify", "payments_verify_bp")

register_blueprint_if_exists(trends_bp,           "/business/trends")
register_blueprint_if_exists(payments_bp,         "/business/payments")
register_blueprint_if_exists(affiliates_bp,       "/business/affiliates")
register_blueprint_if_exists(media_bp,            "/business/media")
register_blueprint_if_exists(autopost_bp,         "/business/autopost")
register_blueprint_if_exists(affiliates_intel_bp, "/business/affiliates_intel")
register_blueprint_if_exists(reports_bp,          "/business/reports")

# O verify.py compartilha o mesmo prefixo de payments:
register_blueprint_if_exists(payments_verify_bp,  "/business/payments")

print("✅ Todos os blueprints foram processados com segurança.")

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
# ⏰ Schedulers — Ativação Condicional
# ============================================
ENABLE_SCHEDULERS = os.getenv("ENABLE_SCHEDULERS", "true").lower() == "true"

if ENABLE_SCHEDULERS:
    # Scheduler de mídia automática (BANNERS)
    try:
        from business.media_ai.scheduler_ads import start_scheduler_if_enabled
        start_scheduler_if_enabled()
    except Exception as e:
        print(f"⚠️ Falha ao iniciar Banner Scheduler: {e}")

    # Se você tiver outro scheduler central, pode manter aqui:
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
