from flask import Flask, jsonify
from flask_cors import CORS
from routes.automacao import automacao_bp
from routes.links import links_bp
from routes.analytics import analytics_bp

# Inicializa o app Flask
app = Flask(__name__)
CORS(app)

# Rota raiz (teste rápido)
@app.route('/')
def index():
    return jsonify({
        "status": "online",
        "message": "🎩 Cosa Nostra — La Famiglia Links ativo e pronto.",
        "version": "1.0.0"
    })

# Registro dos Blueprints (rotas principais)
app.register_blueprint(automacao_bp, url_prefix='/api/automacao')
app.register_blueprint(links_bp, url_prefix='/api/links')
app.register_blueprint(analytics_bp, url_prefix='/api/analytics')

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
