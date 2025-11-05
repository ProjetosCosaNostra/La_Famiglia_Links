# ============================================
# 🔗 LA FAMIGLIA LINKS ROUTES
# CRUD de links afiliados e estratégicos
# ============================================
from flask import Blueprint, jsonify, request, render_template
from models.links_model import (
    init_links_table,
    listar_links,
    adicionar_link,
    atualizar_link,
    excluir_link
)
from auth import require_token

links_bp = Blueprint("links_bp", __name__, url_prefix="/links")

# Garante que a tabela existe
init_links_table()

# ============================================
# 🌐 Página HTML de gerenciamento
# ============================================
@links_bp.route("/", methods=["GET"])
@require_token
def links_dashboard():
    """Renderiza a página de gerenciamento de links."""
    data = listar_links()
    return render_template("manage_links.html", links=data)

# ============================================
# 📋 API — Listar todos os links
# ============================================
@links_bp.route("/api", methods=["GET"])
@require_token
def api_listar_links():
    return jsonify(listar_links())

# ============================================
# ➕ API — Criar novo link
# ============================================
@links_bp.route("/api", methods=["POST"])
@require_token
def api_criar_link():
    data = request.get_json() or {}
    nome = data.get("nome")
    url = data.get("url")
    if not nome or not url:
        return jsonify({"erro": "Campos obrigatórios: nome e url"}), 400
    adicionar_link(nome, url)
    return jsonify({"sucesso": True, "mensagem": f"Link '{nome}' adicionado."})

# ============================================
# ✏️ API — Atualizar link existente
# ============================================
@links_bp.route("/api/<int:link_id>", methods=["PUT"])
@require_token
def api_atualizar_link(link_id):
    data = request.get_json() or {}
    nome = data.get("nome")
    url = data.get("url")
    if not nome or not url:
        return jsonify({"erro": "Campos obrigatórios: nome e url"}), 400
    atualizar_link(link_id, nome, url)
    return jsonify({"sucesso": True, "mensagem": f"Link {link_id} atualizado."})

# ============================================
# 🗑️ API — Excluir link
# ============================================
@links_bp.route("/api/<int:link_id>", methods=["DELETE"])
@require_token
def api_excluir_link(link_id):
    excluir_link(link_id)
    return jsonify({"sucesso": True, "mensagem": f"Link {link_id} removido."})
