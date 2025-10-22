from flask import Flask, jsonify
from flask_cors import CORS
from routes.links import links_bp
from routes.analytics import analytics_bp
from routes.automacao import automacao_bp

# Inicializa o app
app = Flask(__name__)
CORS(app)

# Registra os blueprints com prefixos
app.register_blueprint(links_bp, url_prefix="/api/links")
app.register_blueprint(analytics_bp, url_prefix="/api/analytics")
app.register_blueprint(automacao_bp, url_prefix="/api/automacao")

# Rota principal de teste
@app.route('/')
def home():
    return jsonify({
        "status": "online",
        "mensagem": "API La Famiglia Links está no ar — 🎩 Família, honra e estratégia."
    }), 200

# Inicialização local (Render usa o gunicorn)
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=10000)
