# ============================================
# 🎩 La Famiglia Links — Painel Principal (Dinâmico)
# ============================================

from flask import Blueprint, render_template, jsonify
from models.database import get_db_connection
from auth import require_token

dashboard_bp = Blueprint("dashboard_bp", __name__, template_folder="templates")

# ============================================
# 🏛️ PAINEL PRINCIPAL — VISÃO GERAL
# ============================================
@dashboard_bp.route("/view")
@require_token
def dashboard_view():
    """Exibe o painel principal da Família."""
    conn = get_db_connection()
    cur = conn.cursor()

    def safe_count(query):
        try:
            cur.execute(query)
            return cur.fetchone()[0]
        except Exception:
            return 0

    stats = {
        "links_ativos": safe_count("SELECT COUNT(*) FROM links"),
        "usuarios": safe_count("SELECT COUNT(*) FROM users"),
        "campanhas": safe_count("SELECT COUNT(*) FROM campanhas"),
        "afiliados": safe_count("SELECT COUNT(*) FROM afiliados")
    }

    conn.close()
    return render_template("business_view.html", stats=stats)

# ============================================
# 📊 API — DADOS DO PAINEL (AJAX)
# ============================================
@dashboard_bp.route("/api/dashboard", methods=["GET"])
@require_token
def api_dashboard_data():
    """Retorna estatísticas atualizadas do painel."""
    conn = get_db_connection()
    cur = conn.cursor()

    def safe_count(query):
        try:
            cur.execute(query)
            return cur.fetchone()[0]
        except Exception:
            return 0

    data = {
        "links": safe_count("SELECT COUNT(*) FROM links"),
        "usuarios": safe_count("SELECT COUNT(*) FROM users"),
        "campanhas": safe_count("SELECT COUNT(*) FROM campanhas"),
        "afiliados": safe_count("SELECT COUNT(*) FROM afiliados")
    }

    conn.close()
    return jsonify(data)

# ============================================
# ⚙️ STATUS DO PAINEL — HEALTH CHECK
# ============================================
@dashboard_bp.route("/api/status")
def status_check():
    """Verifica se o painel está operacional."""
    return jsonify({
        "status": "online",
        "service": "La Famiglia Dashboard",
        "message": "Família, honra e respeito."
    }), 200
