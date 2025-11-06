from flask import Blueprint, jsonify, render_template
from models.database import get_db
from .models import ProdutoAfiliado
from .services import buscar_produtos_amazon, buscar_produtos_mercadolivre

affiliates_bp = Blueprint("affiliates_bp", __name__, url_prefix="/business/affiliates")

# ============================================================
# 🧠 GERAÇÃO AUTOMÁTICA DE PRODUTOS
# ============================================================
@affiliates_bp.route("/atualizar", methods=["GET"])
def atualizar_produtos():
    db = get_db()
    produtos = buscar_produtos_amazon() + buscar_produtos_mercadolivre()

    novos = []
    for p in produtos:
        prod = ProdutoAfiliado(
            nome=p["nome"],
            preco=p["preco"],
            link=p["link"],
            imagem=p["imagem"],
            origem="Amazon" if "amazon" in p["link"] else "Mercado Livre",
        )
        db.add(prod)
        novos.append(prod.to_dict())
    db.commit()
    return jsonify({"status": "ok", "produtos": novos})


# ============================================================
# 📜 LISTA DE PRODUTOS
# ============================================================
@affiliates_bp.route("/listar", methods=["GET"])
def listar_produtos():
    db = get_db()
    produtos = db.query(ProdutoAfiliado).all()
    return jsonify([p.to_dict() for p in produtos])


# ============================================================
# 🖥️ PÁGINA VISUAL (Painel)
# ============================================================
@affiliates_bp.route("/", methods=["GET"])
def painel_affiliates():
    db = get_db()
    produtos = db.query(ProdutoAfiliado).all()
    return render_template("affiliates/affiliates.html", produtos=produtos)
