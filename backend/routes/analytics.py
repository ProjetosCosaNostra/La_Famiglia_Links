# routes/analytics.py
from flask import Blueprint, request, jsonify
from utils.helpers import get_db_connection

analytics_bp = Blueprint("analytics", __name__)

@analytics_bp.route("/recent", methods=["GET"])
def recent_accesses():
    # Exemplo simples: retorna os acessos mais recentes
    conn = get_db_connection()
    rows = conn.execute("SELECT id, link_id, origem, data_acesso FROM acessos ORDER BY data_acesso DESC LIMIT 50").fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows]), 200

# Endpoint para registrar um acesso (opcional: chamado pelo frontend público)
@analytics_bp.route("/hit", methods=["POST"])
def hit():
    data = request.get_json() or {}
    link_id = data.get("link_id")
    origem = data.get("origem", request.remote_addr)

    conn = get_db_connection()
    conn.execute("INSERT INTO acessos (link_id, origem) VALUES (?, ?)", (link_id, origem))
    conn.commit()
    conn.close()
    return jsonify({"mensagem": "Acesso registrado"}), 201
