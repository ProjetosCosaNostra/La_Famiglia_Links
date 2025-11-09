# ============================================
# 🎬 LA FAMIGLIA MEDIA AI — Automação de Banners e Vídeos
# ============================================

import os
from flask import Blueprint, render_template, jsonify, request
from datetime import datetime

# ============================================
# ⚙️ Configuração da Blueprint
# ============================================

media_bp = Blueprint(
    "media_bp",
    __name__,
    url_prefix="/business/media",
    template_folder="templates",  # ✅ Caminho relativo — compatível com Render
    static_folder="static"        # ✅ Para arquivos JS/CSS específicos do módulo
)

# ============================================
# 🧱 Estrutura de Pastas e Logs
# ============================================

MEDIA_OUTPUT_DIR = os.path.join("static", "media_output")
os.makedirs(MEDIA_OUTPUT_DIR, exist_ok=True)

def log_event(msg: str):
    """Registra logs no terminal com timestamp."""
    print(f"[🎩 MEDIA_AI] {datetime.now().strftime('%H:%M:%S')} — {msg}")

# ============================================
# 🧠 Painel Principal — Dashboard Cinematográfico
# ============================================

@media_bp.route("/banner_dashboard")
def banner_dashboard():
    """
    Renderiza o painel administrativo de banners.
    """
    try:
        log_event("Acessando painel de banners...")
        return render_template("banner_dashboard.html")
    except Exception as e:
        log_event(f"❌ Falha ao renderizar banner_dashboard.html: {e}")
        return jsonify({"erro": "Falha ao carregar painel"}), 500


# ============================================
# 🧩 API — Gerar Banner Automático (IA)
# ============================================

@media_bp.route("/generate_banner", methods=["POST"])
def generate_banner():
    """
    Gera um banner automático via IA.
    Recebe dados JSON:
    {
        "prompt": "Texto para o banner",
        "theme": "gold_black" | "red_white"
    }
    """
    try:
        data = request.get_json()
        prompt = data.get("prompt", "La Famiglia - Poder, Lealdade e Estilo")
        theme = data.get("theme", "gold_black")

        log_event(f"Gerando banner com tema '{theme}' e prompt '{prompt}'")

        # Simulação da geração (substituir pela IA real futuramente)
        banner_path = os.path.join(MEDIA_OUTPUT_DIR, "banner_famiglia.png")
        with open(banner_path, "wb") as f:
            f.write(b"\x89PNG\r\n\x1a\n")  # Cabeçalho PNG válido mínimo

        log_event(f"✅ Banner gerado com sucesso: {banner_path}")
        return jsonify({
            "ok": True,
            "message": "Banner gerado com sucesso.",
            "file": banner_path
        }), 200

    except Exception as e:
        log_event(f"❌ Erro ao gerar banner: {e}")
        return jsonify({"ok": False, "erro": str(e)}), 500


# ============================================
# 🧠 API — Gerar Vídeo Promocional (IA)
# ============================================

@media_bp.route("/generate_video", methods=["POST"])
def generate_video():
    """
    Gera vídeos promocionais automáticos (IA).
    Entrada esperada: { "prompt": "descrição", "style": "cinematic" }
    """
    try:
        data = request.get_json() or {}
        prompt = data.get("prompt", "O poder da Família.")
        style = data.get("style", "cinematic")

        log_event(f"🎥 Gerando vídeo: prompt='{prompt}', estilo='{style}'")

        output_file = os.path.join(MEDIA_OUTPUT_DIR, "video_famiglia.mp4")
        with open(output_file, "wb") as f:
            f.write(b"")  # Placeholder do arquivo de vídeo

        log_event(f"✅ Vídeo gerado com sucesso: {output_file}")
        return jsonify({
            "ok": True,
            "file": output_file,
            "message": "Vídeo gerado com sucesso."
        })

    except Exception as e:
        log_event(f"❌ Erro ao gerar vídeo: {e}")
        return jsonify({"ok": False, "erro": str(e)}), 500


# ============================================
# 🧭 Healthcheck do módulo
# ============================================

@media_bp.route("/healthz")
def healthz():
    """Confirma se o módulo Media AI está ativo."""
    return jsonify({
        "status": "ok",
        "module": "media_ai",
        "message": "Media AI operacional e vigilante 🎬"
    }), 200
