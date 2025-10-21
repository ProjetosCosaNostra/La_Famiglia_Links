# ==============================================
# 🎩 COSA NOSTRA - AUTO POSTS ROUTE
# Exibe e gerencia os posts automáticos gerados pela IA
# ==============================================

from flask import Blueprint, jsonify
import sqlite3
from pathlib import Path

auto_posts_bp = Blueprint("auto_posts", __name__)
DB_PATH = Path(__file__).resolve().parents[1] / "famiglia.db"

@auto_posts_bp.route("/api/posts_auto", methods=["GET"])
def listar_posts_auto():
    try:
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        cur.execute("SELECT id, titulo, descricao, imagem, link, data FROM posts_auto ORDER BY id DESC")
        rows = cur.fetchall()
        conn.close()

        posts = [
            {
                "id": row[0],
                "titulo": row[1],
                "descricao": row[2],
                "imagem": row[3],
                "link": row[4],
                "data": row[5]
            }
            for row in rows
        ]
        return jsonify({"status": "success", "data": posts}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
