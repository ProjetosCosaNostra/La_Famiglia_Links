# ============================================
# 🎩 LA FAMIGLIA LINKS — WSGI / Bootstrap Seguro
# ============================================

import os
from flask import Flask, render_template, jsonify

# -----------------------------------------------------------------------------
# Flags por ambiente (evita cair no boot):
# -----------------------------------------------------------------------------
ENABLE_SCHEDULERS = os.getenv("ENABLE_SCHEDULERS", "false").lower() in ("1", "true", "yes")
ENABLE_HEAVY_MODULES = os.getenv("ENABLE_HEAVY_MODULES", "true").lower() in ("1", "true", "yes")

def create_app() -> Flask:
    app = Flask(__name__)

    # ---- CORS opcional
    try:
        from flask_cors import CORS
        CORS(app)
    except Exception as e:
        print(f"⚠️ CORS indisponível: {e}")

    # ---- Healthcheck mínimo
    @app.route("/healthz")
    def healthz():
        return jsonify({"status": "ok"}), 200

    # ---- Banco (não falhar o boot)
    try:
        from models.database import init_db
        init_db()
        print("✅ Banco inicializado/validado.")
    except Exception as e:
        print(f"⚠️ Banco não inicializado (seguindo sem travar): {e}")

    # ---- Registrar rotas essenciais primeiro (para garantir boot)
    try:
        from routes.links_routes import links_bp
        from models.links_model import listar_links

        app.register_blueprint(links_bp, url_prefix="/links")

        @app.route("/")
        def home():
            try:
                links = listar_links()
            except Exception as e:
                print(f"⚠️ Falha ao listar links: {e}")
                links = []
            return render_template("index.html", links=links)

        @app.route("/mobile")
        def mobile():
            try:
                links = listar_links()
            except Exception as e:
                print(f"⚠️ Falha ao listar links (mobile): {e}")
                links = []
            return render_template("mobile/index_mobile.html", links=links)

    except Exception as e:
        print(f"❗ Erro ao registrar rotas essenciais: {e}")

    # ---- Módulos pesados/IA: só tentamos se habilitado
    if ENABLE_HEAVY_MODULES:
        _register_optional_blueprints(app)
        _start_optional_schedulers()
        _generate_qrcode_safe()
    else:
        print("⏭️ ENABLE_HEAVY_MODULES desativado — subindo somente núcleo.")

    return app


def _register_optional_blueprints(app: Flask):
    def _try(bp_path: str, attr: str, url_prefix: str):
        try:
            mod = __import__(bp_path, fromlist=[attr])
            bp = getattr(mod, attr)
            app.register_blueprint(bp, url_prefix=url_prefix)
            print(f"✅ Blueprint registrado: {bp_path} -> {url_prefix}")
        except Exception as e:
            print(f"⚠️ Falha ao registrar {bp_path}: {e}")

    # IA básica
    _try("routes.ia_routes", "ia_bp", "/api")

    # Business modules
    _try("business.trends.routes", "trends_bp", "/business/trends")
    _try("business.payments.routes", "payments_bp", "/business/payments")
    _try("business.affiliates.routes", "affiliates_bp", "/business/affiliates")
    _try("business.media_ai.routes", "media_bp", "/business/media")
    _try("business.autopost.routes", "autopost_bp", "/business/autopost")

    # Inteligência de afiliados (opcional)
    try:
        from business.affiliates_intel.routes import affiliates_intel_bp
        app.register_blueprint(affiliates_intel_bp, url_prefix="/business/affiliates_intel")
        print("✅ affiliates_intel habilitado.")
    except Exception as e:
        print(f"ℹ️ affiliates_intel indisponível: {e}")

    # Dashboard admin (opcional)
    try:
        from business.dashboard.routes import business_bp
        app.register_blueprint(business_bp, url_prefix="/business")
        print("✅ Dashboard business habilitado.")
    except Exception as e:
        print(f"ℹ️ Dashboard business indisponível: {e}")

    # Auth (opcional — não trava boot)
    try:
        from auth import auth_bp
        app.register_blueprint(auth_bp, url_prefix="/auth")
        print("✅ Auth habilitado.")
    except Exception as e:
        print(f"ℹ️ Auth indisponível: {e}")


def _start_optional_schedulers():
    if not ENABLE_SCHEDULERS:
        print("⏸️ Schedulers desativados por ENABLE_SCHEDULERS.")
        return
    # cada scheduler protegido individualmente
    for label, path, func in [
        ("principal", "backend.scheduler_job", "iniciar_scheduler"),
        ("autopost", "business.autopost.scheduler", "iniciar_autopost_scheduler"),
        ("afiliados", "business.affiliates_intel.scheduler", "iniciar_affiliates_scheduler"),
        ("media_ai", "business.media_ai.scheduler_media", "iniciar_scheduler_media"),
    ]:
        try:
            mod = __import__(path, fromlist=[func])
            getattr(mod, func)()
            print(f"🕰️ Scheduler {label} iniciado.")
        except Exception as e:
            print(f"⚠️ Scheduler {label} não iniciado: {e}")


def _generate_qrcode_safe():
    try:
        from utils.qrcode_generator import gerar_qrcode_famiglia
        base_url = (
            os.getenv("FAMIGLIA_URL")
            or os.getenv("RENDER_EXTERNAL_URL")
            or "http://127.0.0.1:10000"
        )
        gerar_qrcode_famiglia(base_url)
        print("📱 QRCode gerado/atualizado.")
    except Exception as e:
        print(f"⚠️ Falha ao gerar QRCode (seguindo): {e}")


# WSGI entry
app = create_app()

if __name__ == "__main__":
    # Execução local (Render usa gunicorn)
    port = int(os.getenv("PORT", "10000"))
    app.run(host="0.0.0.0", port=port, debug=False)
