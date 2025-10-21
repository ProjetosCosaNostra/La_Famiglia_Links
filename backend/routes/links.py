# routes/links.py
from flask import Blueprint, request, jsonify, current_app
from utils.helpers import get_db_connection, token_required
import sqlite3

links_bp = Blueprint("links", __name__)

# GET all links
@links_bp.route("/", methods=["GET"])
def listar_links_publico():
    conn = get_db_connection()
    rows = conn.execute("SELECT id, titulo, url, descricao, criado_em FROM links ORDER BY id DESC").fetchall()
    conn.close()
    lista = [dict(r) for r in rows]
    return jsonify(lista), 200

# Protected route: create link (requires token)
@links_bp.route("/", methods=["POST"])
@token_required
def criar_link():
    data = request.get_json() or {}
    titulo = data.get("titulo")
    url = data.get("url")
    descricao = data.get("descricao", "")

    if not titulo or not url:
        return jsonify({"erro": "titulo e url são obrigatórios"}), 400

    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("INSERT INTO links (titulo, url, descricao) VALUES (?, ?, ?)", (titulo, url, descricao))
    conn.commit()
    new_id = cur.lastrowid
    conn.close()
    return jsonify({"mensagem": "Link criado", "id": new_id}), 201

# Protected edit
@links_bp.route("/<int:link_id>", methods=["PUT"])
@token_required
def editar_link(link_id):
    data = request.get_json() or {}
    titulo = data.get("titulo")
    url = data.get("url")
    descricao = data.get("descricao", "")

    if not titulo or not url:
        return jsonify({"erro": "titulo e url são obrigatórios"}), 400

    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("UPDATE links SET titulo = ?, url = ?, descricao = ? WHERE id = ?", (titulo, url, descricao, link_id))
    conn.commit()
    conn.close()
    return jsonify({"mensagem": "Link atualizado"}), 200

# Protected delete
@links_bp.route("/<int:link_id>", methods=["DELETE"])
@token_required
def deletar_link(link_id):
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("DELETE FROM links WHERE id = ?", (link_id,))
    conn.commit()
    conn.close()
    return jsonify({"mensagem": "Link removido"}), 200
