# ============================================
# 🧠 LA FAMIGLIA — Inteligência de Afiliados
# Busca produtos (ML/Amazon), salva, gera posts
# ============================================

from flask import Blueprint, request, jsonify, render_template
from auth import require_token
from .models import ensure_tables, insert_product, list_products, insert_post, recent_posts
from .services import search_products, gerar_legenda_ia

affiliates_intel_bp = Blueprint("affiliates_intel_bp", __name__, template_folder="templates")

@affiliates_intel_bp.route("/business/affiliates_intel", methods=["GET"])
@require_token
def intel_home():
    ensure_tables()
    prods = list_products(limit=50)
    posts = recent_posts(limit=12)
    return render_template("affiliates_intel.html", products=prods, posts=posts)

# ------------------------------------------------------------
# 🔎 Coleta / scan
# ------------------------------------------------------------
@affiliates_intel_bp.route("/business/affiliates_intel/scan", methods=["POST"])
@require_token
def intel_scan():
    data = request.get_json(silent=True) or request.form or {}
    query = (data.get("query") or "").strip()
    if not query:
        return jsonify({"ok": False, "error": "query obrigatória"}), 400
    sources = data.get("sources") or ["mercado_livre", "amazon"]
    limit = int(data.get("limit") or 10)

    results = search_products(query, tuple(sources), limit=limit)
    saved = []
    for r in results:
        pid = insert_product(r)
        saved.append(pid)
    return jsonify({"ok": True, "found": len(results), "saved": len(saved)})

# ------------------------------------------------------------
# 🧠 Gera legenda + registra post (imagem/vídeo pode ser gerado em outros módulos)
# ------------------------------------------------------------
@affiliates_intel_bp.route("/business/affiliates_intel/generate_caption", methods=["POST"])
@require_token
def generate_caption():
    data = request.get_json(silent=True) or {}
    product_id = data.get("product_id")
    title = data.get("title")
    price = float(data.get("price") or 0)
    source = data.get("source") or "desconhecida"
    platform = (data.get("platform") or "instagram").lower()

    if not all([product_id, title]):
        return jsonify({"ok": False, "error": "product_id e title obrigatórios"}), 400

    caption = gerar_legenda_ia(title, price, source)
    post_id = insert_post(product_id, platform, caption)
    return jsonify({"ok": True, "post_id": post_id, "caption": caption})

# ------------------------------------------------------------
# 🧰 Web helpers (ex.: ajax listar)
# ------------------------------------------------------------
@affiliates_intel_bp.route("/business/affiliates_intel/api/list", methods=["GET"])
@require_token
def api_list():
    limit = int(request.args.get("limit", "50"))
    prods = list_products(limit=limit)
    payload = []
    for (pid, source, external_id, title, price, currency, url, image, aff_url, created_at) in prods:
        payload.append({
            "id": pid,
            "source": source,
            "external_id": external_id,
            "title": title,
            "price": price,
            "currency": currency,
            "url": url,
            "image": image,
            "affiliate_url": aff_url,
            "created_at": created_at
        })
    return jsonify(payload)
