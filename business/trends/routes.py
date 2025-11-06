from flask import Blueprint, jsonify
from .crawler import coletar_tendencias
from .models import listar_tendencias
from .ai_analyzer import gerar_descricao_ia
from datetime import datetime

trends_bp = Blueprint("trends_bp", __name__, url_prefix="/business/trends")

@trends_bp.route("/atualizar", methods=["GET"])
def atualizar_tendencias():
    """Coleta e atualiza as tendências do dia."""
    coletar_tendencias()
    return jsonify({"status": "ok", "mensagem": "Tendências atualizadas com sucesso."})

@trends_bp.route("/listar", methods=["GET"])
def listar():
    """Lista as tendências mais recentes."""
    dados = listar_tendencias()
    return jsonify({"status": "ok", "tendencias": dados})

@trends_bp.route("/descricao/<produto>", methods=["GET"])
def descricao(produto):
    """Gera descrição IA para um produto específico."""
    texto = gerar_descricao_ia(produto)
    return jsonify({"produto": produto, "descricao": texto, "gerado_em": datetime.utcnow().isoformat()})
