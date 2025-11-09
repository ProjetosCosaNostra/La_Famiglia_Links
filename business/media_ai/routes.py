# ============================================
# 🎬 LA FAMIGLIA MEDIA AI — Painel e IA Publicitária
# ============================================

from flask import Blueprint, render_template, jsonify, request
import os

media_bp = Blueprint("media_bp", __name__, url_prefix="/business/media")

# ============================================================
# 🧠 1️⃣ Painel Cinematográfico (Interface IA)
# ============================================================
@media_bp.route("/banner_dashboard")
def banner_dashboard():
    """Painel visual de criação de banners cinematográficos."""
    print("✅ Rota /banner_dashboard acessada com sucesso.")
    try:
        return render_template("banner_dashboard.html")
    except Exception as e:
        print(f"⚠️ Falha ao renderizar banner_dashboard.html: {e}")
        return jsonify({"erro": "Falha ao carregar painel"}), 500


# ============================================================
# 🖼️ 2️⃣ Geração de Banner via API
# ============================================================
@media_bp.route("/generate_banner", methods=["POST"])
def generate_banner():
    """Recebe dados e gera banner IA cinematográfico."""
    data = request.get_json() or {}
    titulo = data.get("titulo", "Produto La Famiglia")
    descricao = data.get("descricao", "Estilo, poder e precisão.")
    cor = data.get("cor", "gold")

    # Aqui você pode integrar a IA futuramente.
    print(f"🎨 Gerando banner: {titulo} | Cor: {cor}")

    output_path = f"static/generated/{titulo.replace(' ', '_')}.png"
    os.makedirs("static/generated", exist_ok=True)
    with open(output_path, "w") as f:
        f.write("Simulação de banner IA gerado.")
    
    return jsonify({"status": "ok", "banner_url": output_path})
