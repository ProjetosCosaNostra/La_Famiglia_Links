from flask import Flask, jsonify
from flask_cors import CORS
from routes.links import links_bp
from routes.analytics import analytics_bp
from routes.automacao import automacao_bp

def create_app():
    app = Flask(__name__)
    CORS(app)

    # Registro das rotas (blueprints)
    app.register_blueprint(links_bp, url_prefix="/api/links")
    app.register_blueprint(analytics_bp, url_prefix="/api/analytics")
    app.register_blueprint(automacao_bp, url_prefix="/api/automacao")

    @app.route('/')
    def home():
        return jsonify({
            "status": "online",
            "mensagem": "API La Famiglia Links está no ar — 🎩 Família, honra e estratégia."
        }), 200

    return app

# Render usa o objeto app
app = create_app()
