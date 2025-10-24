from flask import Flask, jsonify
from flask_cors import CORS

# Importa os blueprints das rotas
from routes.automacao import automacao_bp
from routes.links import links_bp
from routes.analytics import analytics_bp

# Cria a aplicação Flask
app = Flask(__name__)
CORS(app)

# 🩺 Rota de verificação de saúde (para Render)
@app.route("/health")
def health():
    return jsonify({"status": "ok"}), 200

# 🔗 Registro dos blueprints
app.register_blueprint(automacao_bp, url_prefix="/api/automacao")
app.register_blueprint(links_bp, url_prefix="/api/links")
app.register_blueprint(analytics_bp, url_prefix="/api/analytics")

# 🚀 Endpoint inicial (opcional, mostra status geral da API)
@app.route("/")
def index():
    return jsonify({
        "message": "La Famiglia Links API está online 🎩♟️",
        "routes": {
            "/health": "Verifica status do servidor",
            "/api/links": "Gerencia e retorna links de afiliado",
            "/api/automacao": "Controle e automação de postagens",
            "/api/analytics": "Dados e métricas das campanhas"
        }
    }), 200

# 🔥 Execução local
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
