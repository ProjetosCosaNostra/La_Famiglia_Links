# ============================================
# 🎬 LA FAMIGLIA LINKS — Módulo de Mídia IA
# Gera banners e vídeos automáticos para reels e stories
# ============================================

from flask import Blueprint, jsonify, request
import os
from datetime import datetime

from .video_generator import gerar_video_publicitario
from .text_overlay import gerar_banner_com_texto
from .models import inserir_video, inserir_banner

media_bp = Blueprint("media_bp", __name__, url_prefix="/business/media")

# ============================================================
# 🎨 1️⃣ GERAR BANNER AUTOMÁTICO
# ============================================================
@media_bp.route("/generate_banner", methods=["POST"])
def generate_banner():
    """
    JSON esperado:
    {
        "titulo": "Relógio Dourado",
        "descricao": "Poder, elegância e respeito. A escolha dos aliados.",
        "imagem": "static/generated/relogio.png"
    }
    """
    data = request.get_json() or {}
    titulo = data.get("titulo")
    descricao = data.get("descricao")
    imagem = data.get("imagem")

    if not all([titulo, descricao, imagem]):
        return jsonify({"ok": False, "error": "Campos obrigatórios: titulo, descricao, imagem"}), 400

    try:
        out_path = gerar_banner_com_texto(imagem, titulo, descricao)
        inserir_banner(titulo, descricao, imagem, out_path)
        return jsonify({"ok": True, "banner_url": out_path})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


# ============================================================
# 🎬 2️⃣ GERAR VÍDEO AUTOMÁTICO
# ============================================================
@media_bp.route("/generate_video", methods=["POST"])
def generate_video():
    """
    JSON esperado:
    {
        "titulo": "Canivete Elite",
        "descricao": "Precisão em cada lâmina. Feito para quem comanda.",
        "imagem": "static/generated/canivete.png"
    }
    """
    data = request.get_json() or {}
    titulo = data.get("titulo")
    descricao = data.get("descricao")
    imagem = data.get("imagem")

    if not all([titulo, descricao, imagem]):
        return jsonify({"ok": False, "error": "Campos obrigatórios: titulo, descricao, imagem"}), 400

    try:
        out_path = gerar_video_publicitario(titulo, descricao, imagem)
        inserir_video(titulo, descricao, imagem, out_path)
        return jsonify({"ok": True, "video_url": out_path})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


# ============================================================
# ⚙️ 3️⃣ ENDPOINT UNIFICADO — GERA BANNER + VÍDEO
# ============================================================
@media_bp.route("/generate_ad", methods=["POST"])
def generate_ad():
    """
    Gera automaticamente um pacote de mídia completo (banner + vídeo)
    com base em um produto de afiliado.
    
    JSON esperado:
    {
        "title": "Relógio Dourado",
        "price": 349.90,
        "source": "mercado_livre",
        "image": "static/generated/relogio_dourado.png"
    }
    """
    data = request.get_json() or {}
    titulo = data.get("title") or "Produto Misterioso"
    preco = data.get("price") or 0
    imagem = data.get("image")
    source = data.get("source") or "desconhecido"

    if not imagem:
        return jsonify({"ok": False, "error": "Campo 'image' é obrigatório"}), 400

    descricao = f"Direto de {source.title()} — {titulo}. Exclusividade e poder por apenas R$ {preco:.2f}."

    try:
        # 🖼️ Gera o banner
        banner_path = gerar_banner_com_texto(imagem, titulo, descricao)
        inserir_banner(titulo, descricao, imagem, banner_path)

        # 🎬 Gera o vídeo curto
        video_path = gerar_video_publicitario(titulo, descricao, banner_path)
        inserir_video(titulo, descricao, banner_path, video_path)

        return jsonify({
            "ok": True,
            "banner_url": banner_path,
            "video_url": video_path,
            "mensagem": f"Mídia completa gerada para {titulo}"
        })
    except Exception as e:
        return jsonify({"ok": False, "error": f"Falha ao gerar anúncio: {e}"}), 500


# ============================================================
# 🎞️ 4️⃣ LISTAR MÍDIAS GERADAS
# ============================================================
@media_bp.route("/listar", methods=["GET"])
def listar_midias():
    """
    Retorna todos os banners e vídeos gerados no histórico.
    """
    try:
        from .models import listar_banners, listar_videos
        return jsonify({
            "ok": True,
            "banners": listar_banners(),
            "videos": listar_videos()
        })
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


# ============================================================
# 🤖 5️⃣ TESTE RÁPIDO DE STATUS
# ============================================================
@media_bp.route("/status", methods=["GET"])
def status():
    """
    Teste rápido do microserviço de mídia IA.
    """
    return jsonify({
        "ok": True,
        "status": "online",
        "time": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    })
