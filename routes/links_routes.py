# ============================================
# 🔗 LA FAMIGLIA LINKS — Gerenciamento de Links
# ============================================
from flask import Blueprint, render_template, request, redirect, url_for, jsonify
from models.database import listar_links, adicionar_link, remover_link

links_bp = Blueprint("links_bp", __name__, template_folder="../templates")

# ============================================
# 🏠 Página principal de listagem de links
# ============================================
@links_bp.route("/links", methods=["GET"])
def listar():
    """Lista todos os links da Família."""
    try:
        links = listar_links()
        return render_template("manage_links.html", links=links)
    except Exception as e:
        print(f"⚠️ Erro ao listar links: {e}")
        return jsonify({"erro": str(e)}), 500

# ============================================
# ➕ Adicionar novo link
# ============================================
@links_bp.route("/links/add", methods=["POST"])
def add_link():
    """Adiciona um novo link à lista."""
    nome = request.form.get("nome")
    url = request.form.get("url")
    categoria = request.form.get("categoria", "geral")

    if not nome or not url:
        return jsonify({"erro": "Campos obrigatórios ausentes"}), 400

    try:
        adicionar_link(nome, url, categoria)
        print(f"🧩 Novo link adicionado: {nome}")
        return redirect(url_for("links_bp.listar"))
    except Exception as e:
        print(f"⚠️ Erro ao adicionar link: {e}")
        return jsonify({"erro": str(e)}), 500

# ============================================
# ❌ Remover link existente
# ============================================
@links_bp.route("/links/delete/<int:link_id>", methods=["POST", "GET"])
def delete_link(link_id):
    """Remove um link do banco."""
    try:
        remover_link(link_id)
        print(f"🗑️ Link removido: {link_id}")
        return redirect(url_for("links_bp.listar"))
    except Exception as e:
        print(f"⚠️ Erro ao remover link: {e}")
        return jsonify({"erro": str(e)}), 500
