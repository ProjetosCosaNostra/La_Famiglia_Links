# ============================================
# ♟️ ROTA DE AUTOMAÇÃO - GERAÇÃO E SINCRONIZAÇÃO
# ============================================

from flask import Blueprint, jsonify, request
import random
import datetime

automacao_bp = Blueprint('automacao', __name__, url_prefix='/api')

# Lista simulada de produtos
PRODUTOS_FAKE = [
    {"titulo": "Luminária RGB Inteligente", "plataforma": "Mercado Livre"},
    {"titulo": "Teclado Mecânico Gamer RGB", "plataforma": "Amazon"},
    {"titulo": "Mouse Ergonômico Sem Fio", "plataforma": "Amazon"},
    {"titulo": "Suporte Articulado para Microfone", "plataforma": "Mercado Livre"},
]

# ============================================
# 🔁 GERAÇÃO AUTOMÁTICA DE POSTS
# ============================================
@automacao_bp.route('/gerar_posts', methods=['POST'])
def gerar_posts():
    data = request.get_json()
    quantidade = int(data.get('quantidade', 1))
    
    escolhidos = random.sample(PRODUTOS_FAKE, k=min(quantidade, len(PRODUTOS_FAKE)))
    mensagens = []
    for p in escolhidos:
        msg = f"🎩 Novo post: {p['titulo']} — disponível em {p['plataforma']}!"
        mensagens.append(msg)

    return jsonify({
        "sucesso": True,
        "mensagem": f"{quantidade} post(s) gerado(s) com sucesso.",
        "posts": mensagens
    })

# ============================================
# 🔗 SINCRONIZAÇÃO COM APIs EXTERNAS
# ============================================
@automacao_bp.route('/sincronizar', methods=['GET'])
def sincronizar():
    simulacao = random.choice([True, False])
    if simulacao:
        return jsonify({"sucesso": True, "mensagem": "Produtos sincronizados com sucesso!"})
    else:
        return jsonify({"sucesso": False, "mensagem": "Erro ao sincronizar com APIs externas."})
