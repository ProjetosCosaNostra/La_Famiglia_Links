# app.py
from flask import Flask, send_from_directory, jsonify
from flask_cors import CORS
import os
from models.database import init_db, create_default_admin
from routes.links import links_bp
from routes.analytics import analytics_bp
from auth import auth_bp  # mantém seu auth.py (login/register) existente

# APP
app = Flask(__name__, static_folder="../frontend", static_url_path="/")
# Use secret key from environment when possible
app.config["SECRET_KEY"] = os.environ.get("COSANOSTRA_SECRET", "cosanostra_segredo_supremo")
CORS(app, supports_credentials=True)

# Registrar blueprints
app.register_blueprint(auth_bp, url_prefix="/api/auth")
app.register_blueprint(links_bp, url_prefix="/api/links")
app.register_blueprint(analytics_bp, url_prefix="/api/analytics")

# Rotas para servir frontend
@app.route("/", methods=["GET"])
def index():
    return send_from_directory(app.static_folder, "index.html")

@app.route("/admin", methods=["GET"])
def admin():
    return send_from_directory(app.static_folder, "admin.html")

@app.route("/<path:path>", methods=["GET"])
def static_proxy(path):
    # Serve arquivos estáticos da pasta frontend
    return send_from_directory(app.static_folder, path)

# Inicialização (db + admin padrão)
@app.before_first_request
def startup():
    print("🎩 Iniciando Cosa Nostra — La Famiglia Links (backend)")
    print("🔧 Inicializando banco de dados...")
    init_db()                     # cria pasta/data e tabelas
    create_default_admin(app)     # cria admin criptografado se não existir
    print("✅ Banco de dados pronto!")

if __name__ == "__main__":
    host = "127.0.0.1"
    port = int(os.environ.get("PORT", 5000))
    print(f"🚀 Servidor rodando em: http://{host}:{port}")
    app.run(debug=True, host=host, port=port)
