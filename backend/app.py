from flask import Flask, jsonify
from flask_cors import CORS
from automacao import automacao_bp
from links import links_bp
from analytics import analytics_bp

# Criação da aplicação Flask
app = Flask(__name__)

# Ativa o CORS para permitir acesso do front-end
CORS(app)

# 🔹 Rota de verificação de saúde (usada pelo Render)
@app.route("/health")
def health_check():
    return jsonify({"status": "ok"}), 200

# 🔹 Rota inicial (raiz)
@app.route("/")
def home():
    return jsonify({"message": "La Famiglia Links API está online 🔥"}), 200

# 🔹 Registro dos Blueprints
app.register_blueprint(automacao_bp, url_prefix="/api/automacao")
app.register_blueprint(links_bp, url_prefix="/api/links")
app.register_blueprint(analytics_bp, url_prefix="/api/analytics")

# 🔹 Inicialização local (Render usa gunicorn automaticamente)
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
