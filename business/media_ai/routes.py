# ============================================
# 🎬 LA FAMIGLIA MEDIA AI — Geração de Banners e Vídeos
# ============================================

from flask import Blueprint, jsonify, request
import os
from .video_generator import gerar_video_publicitario
from .post_generator import gerar_banner_publicitario
from .models import inserir_video, listar_videos

media_bp = Blueprint("media_bp", __name__, url_prefix="/business/media")

# ============================================================
# 🎞️ 1️⃣ Gerar um vídeo publicitário único
# ============================================================
@media_bp.route("/generate_ad", methods=["POST"])
def generate_ad():
    """
    JSON esperado:
    {
      "titulo": "Relógio Dourado",
      "descricao": "Uma peça de poder e elegância.",
      "imagem": "static/generated/relogio.png"
    }
    """
    data = request.get_json() or {}
    titulo = data.get("titulo")
    descricao = data.get("descricao")
    imagem = data.get("imagem")

    if not all([titulo, descricao, imagem]):
        return jsonify({"erro": "Campos obrigatórios: titulo, descricao, imagem"}), 400

    if not os.path.exists(imagem):
        return jsonify({"erro": f"Imagem não encontrada em {imagem}"}), 404

    try:
        out_path = gerar_video_publicitario(titulo, descricao, imagem)
        inserir_video(titulo, descricao, imagem, out_path)
        return jsonify({"status": "ok", "video_url": out_path}), 200
    except Exception as e:
        return jsonify({"erro": f"Falha ao gerar vídeo: {e}"}), 500


# ============================================================
# 🖼️ 2️⃣ Gerar um banner publicitário instantâneo
# ============================================================
@media_bp.route("/generate_banner", methods=["POST"])
def generate_banner():
    """
    Gera um banner cinematográfico La Famiglia com IA.
    JSON esperado:
    {
      "titulo": "Canivete Tático Elite",
      "descricao": "Precisão. Força. Lealdade.",
      "cor": "gold"
    }
    """
    data = request.get_json() or {}
    titulo = data.get("titulo", "Produto Exclusivo")
    descricao = data.get("descricao", "Elegância e poder definem esta peça.")
    cor = data.get("cor", "gold")

    try:
        out_path = gerar_banner_publicitario(titulo, descricao, cor)
        return jsonify({"status": "ok", "banner_url": out_path}), 200
    except Exception as e:
        return jsonify({"erro": f"Falha ao gerar banner: {e}"}), 500


# ============================================================
# 📜 3️⃣ Listar todos os vídeos gerados
# ============================================================
@media_bp.route("/listar_videos", methods=["GET"])
def listar_videos_gerados():
    """Retorna todos os vídeos armazenados no banco."""
    try:
        return jsonify(listar_videos())
    except Exception as e:
        return jsonify({"erro": f"Falha ao listar vídeos: {e}"}), 500
from flask import render_template

@media_bp.route("/banner_dashboard")
def banner_dashboard():
    """Painel web para gerar banners via IA."""
    return render_template("banner_dashboard.html")
