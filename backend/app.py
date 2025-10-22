# backend/app.py
from flask import Flask, jsonify
from flask_cors import CORS
import os
from routes.links import links_bp
from routes.analytics import analytics_bp
from routes.automacao import automacao_bp
from utils.notifier import notificar_inicio_servidor

# ===========================================
# 🎩 CONFIGURAÇÃO PRINCIPAL DO SERVIDOR
# ===========================================
app = Flask(__name__)
CORS(app)

# ===========================================
# 🔧 CONFIGURAÇÃO DE CHAVE SECRETA E BANCO
# ===========================================
app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "familia_honra_respeito_palavra")

# ===========================================
# 📦 REGISTRO DE BLUEPRINTS
# ===========================================
app.register_blueprint(links_bp, url_prefix="/api/links")
app.register_blueprint(analytics_bp, url_prefix="/api/analytics")
app.register_blueprint(automacao_bp, url_prefix="/api/automacao")

# ===========================================
# 🚀 ROTA PRINCIPAL (SAUDAÇÃO)
# ===========================================
@app.route("/")
def home():
    return jsonify({
        "status": "online",
        "message": "🎩 Cosa Nostra — La Famiglia Links ativo e pronto.",
        "version": "1.0.0"
    }), 200

# ===========================================
# 🕵️‍♂️ EXECUÇÃO DO SERVIDOR LOCAL / DEPLOY
# ===========================================
if __name__ == "__main__":
    print("🎩 Iniciando Cosa Nostra — La Famiglia Links")
    print("🔧 Inicializando banco de dados...")
    notificar_inicio_servidor()
    print("✅ Banco de dados pronto!")
    print("🚀 Servidor rodando em: http://127.0.0.1:5000")

    app.run(host="0.0.0.0", port=int(os.getenv("PORT", 5000)), debug=True)
