# ============================================
# 🎩 LA FAMIGLIA LINKS — Flask Principal
# Hub dinâmico + IA + Painéis + Admin
# ============================================

from flask import Flask, render_template
from flask_cors import CORS

# --------------------------------------------
# 🔹 Importações de rotas e módulos
# --------------------------------------------
from routes.ia_routes import ia_bp
from routes.links_routes import links_bp
from models.links_model import listar_links

# Importação opcional (Business Dashboard)
try:
    from business.dashboard.routes import business_bp
except ModuleNotFoundError:
    business_bp = None

# --------------------------------------------
# 🧱 Inicialização da aplicação
# --------------------------------------------
app = Flask(__name__)
CORS(app)

# ============================================
# 🏛️ Rota principal — Hub dinâmico da Família
# ============================================
@app.route('/')
def home():
    """
    Página principal que exibe os links da Família,
    carregados diretamente do banco de dados.
    """
    links = listar_links()
    return render_template('index.html', links=links)

# ============================================
# 🔗 Registro de Blueprints
# ============================================
# IA (Geração de imagem e texto)
app.register_blueprint(ia_bp, url_prefix='/api')

# Painel de Links (CRUD)
app.register_blueprint(links_bp, url_prefix='/links')

# Painel Business (IA + Automação)
if business_bp:
    app.register_blueprint(business_bp, url_prefix='/business')

# ============================================
# 🚀 Execução local
# ============================================
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=10000)
