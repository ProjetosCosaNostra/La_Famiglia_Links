from flask import Flask, jsonify
from flask_cors import CORS

# Importação segura dos blueprints (dentro do backend)
try:
    from backend.automacao import automacao_bp
    from backend.links import links_bp
    from backend.analytics import analytics_bp
except ModuleNotFoundError:
    # Para execução local
    from automacao import automacao_bp
    from links import links_bp
    from analytics import analytics_bp

# Inicializa o Flask
app = Flask(__name__)
CORS(app)

# ----------------------------
# 🔹 Rotas principais
# ----------------------------
@app.route("/")
def home():
    return jsonify({"message": "🔥 API La Famiglia Links está online"}), 200

@app.route("/health")
def health_check():
    return jsonify({"status": "ok", "service": "La Famiglia Links"}), 200

# ----------------------------
# 🔹 Blueprints registrados
# ----------------------------
app.register_blueprint(automacao_bp, url_prefix="/api/automacao")
app.register_blueprint(links_bp, url_prefix="/api/links")
app.register_blueprint(analytics_bp, url_prefix="/api/analytics")

# ----------------------------
# 🔹 Execução local
# ----------------------------
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
