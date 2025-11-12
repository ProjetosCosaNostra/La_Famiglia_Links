from flask import Blueprint, jsonify, render_template
import sqlite3
from models.database import get_db_path
from .models import ProdutoAfiliado
from .services import buscar_produtos_amazon, buscar_produtos_mercadolivre

affiliates_bp = Blueprint("affiliates_bp", __name__, url_prefix="/business/affiliates")

# ============================================================
# 🔧 Conexão de fallback
# ============================================================
def get_db():
    """Conexão compatível com SQLite e PostgreSQL"""
    db_path = get_db_path()
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


# ============================================================
# 🧠 GERAÇÃO AUTOMÁTICA DE PRODUTOS
# ============================================================
@affiliates_bp.route("/atualizar", methods=["GET"])
def atualizar_produtos():
    db = get_db()
    cursor = db.cursor()
    produtos = buscar_produtos_amazon() + buscar_produtos_mercadolivre()

    novos = []
    for p in produtos:
        cursor.execute(
            """
            INSERT INTO produtos_afiliados (nome, preco, link, imagem, origem, criado_em)
            VALUES (?, ?, ?, ?, ?, datetime('now'))
            """,
            (
                p["nome"],
                p["preco"],
                p["link"],
                p["imagem"],
                "Amazon" if "amazon" in p["link"] else "Mercado Livre",
            ),
        )
        novos.append(p)
    db.commit()
    db.close()
    return jsonify({"status": "ok", "produtos": novos})


# ============================================================
# 📜 LISTA DE PRODUTOS
# ============================================================
@affiliates_bp.route("/listar", methods=["GET"])
def listar_produtos():
    db = get_db()
    cursor = db.cursor()
    cursor.execute("SELECT nome, preco, link, imagem, origem, criado_em FROM produtos_afiliados ORDER BY id DESC")
    data = cursor.fetchall()
    db.close()
    produtos = [dict(d) for d in data]
    return jsonify(produtos)


# ============================================================
# 🖥️ PÁGINA VISUAL (Painel)
# ============================================================
@affiliates_bp.route("/", methods=["GET"])
def painel_affiliates():
    db = get_db()
    cursor = db.cursor()
    cursor.execute("SELECT nome, preco, link, imagem, origem, criado_em FROM produtos_afiliados ORDER BY id DESC")
    data = cursor.fetchall()
    db.close()
    produtos = [dict(d) for d in data]
    return render_template("affiliates/affiliates.html", produtos=produtos)
