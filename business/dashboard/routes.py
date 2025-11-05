# ============================================
# 💼 LA FAMIGLIA BUSINESS DASHBOARD
# Rotas principais do painel SaaS e integração com IA
# ============================================

from flask import Blueprint, render_template, jsonify, request
from business.utils.api_client import (
    analyze_text,
    generate_image,
    check_status,
    gerar_post_com_imagem
)
import datetime

# Cria o Blueprint
business_bp = Blueprint('business_bp', __name__, template_folder='templates')

# ============================================
# 🎩 ROTA PRINCIPAL DO PAINEL BUSINESS
# ============================================
@business_bp.route('/')
def dashboard_home():
    """
    Exibe o painel principal do módulo Business.
    """
    status = check_status()
    return render_template(
        'dashboard.html',
        status=status,
        hora=datetime.datetime.now().strftime("%H:%M:%S")
    )

# ============================================
# 🧠 ROTA — TESTE DE STATUS DAS IAs
# ============================================
@business_bp.route('/api/status', methods=['GET'])
def api_status():
    """
    Verifica o status dos microserviços de IA.
    """
    status = check_status()
    return jsonify(status)

# ============================================
# 🧩 ROTA — GERA TEXTO COM IA TEXTUAL
# ============================================
@business_bp.route('/api/gerar_texto', methods=['POST'])
def api_gerar_texto():
    """
    Gera uma descrição chamativa com IA textual.
    Espera JSON: {"prompt": "texto ou produto"}
    """
    data = request.get_json() or {}
    prompt = data.get("prompt")
    if not prompt:
        return jsonify({"erro": "Campo 'prompt' é obrigatório."}), 400

    resultado = analyze_text(prompt)
    return jsonify(resultado)

# ============================================
# 🖼️ ROTA — GERA IMAGEM COM IA VISUAL
# ============================================
@business_bp.route('/api/gerar_imagem', methods=['POST'])
def api_gerar_imagem():
    """
    Gera imagem via IA (Stable Diffusion).
    Espera JSON: {"prompt": "descrição visual", "width": opcional, "height": opcional}
    """
    data = request.get_json() or {}
    prompt = data.get("prompt")
    width = int(data.get("width", 512))
    height = int(data.get("height", 512))
    steps = int(data.get("steps", 20))

    if not prompt:
        return jsonify({"erro": "Campo 'prompt' é obrigatório."}), 400

    resultado = generate_image(prompt, width, height, steps)
    return jsonify(resultado)

# ============================================
# 🧩 ROTA — GERA POST COMPLETO (texto + imagem)
# ============================================
@business_bp.route('/api/gerar_post', methods=['POST'])
def api_gerar_post():
    """
    Cria automaticamente um post com texto e imagem.
    Espera JSON: {"produto": "...", "plataforma": "..."}
    """
    data = request.get_json() or {}
    produto = data.get("produto")
    plataforma = data.get("plataforma")

    if not produto or not plataforma:
        return jsonify({"erro": "Campos 'produto' e 'plataforma' são obrigatórios."}), 400

    resultado = gerar_post_com_imagem(produto, plataforma)
    return jsonify(resultado)

# ============================================
# ⚙️ ROTA — MOCK DE PAINEL ADMIN (FUTURA EXPANSÃO)
# ============================================
@business_bp.route('/config')
def config():
    """
    Tela de configuração futura (assinaturas, automações etc.)
    """
    return jsonify({
        "mensagem": "Painel de configuração em desenvolvimento.",
        "timestamp": datetime.datetime.now().isoformat()
    })
