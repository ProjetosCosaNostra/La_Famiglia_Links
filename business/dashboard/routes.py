# ============================================
# 🎩 LA FAMIGLIA LINKS — BUSINESS DASHBOARD
# Painel administrativo e visão geral do ecossistema
# Agora com filtros e exportação CSV dos logs administrativos
# ============================================

from flask import Blueprint, render_template, jsonify, request, Response
from datetime import datetime
import csv
from io import StringIO
from models.database import get_db
from utils.token_utils import require_token
from models.admin_logs_model import AdminLog
# business/dashboard/routes.py
from flask import Blueprint, render_template, jsonify, request
from datetime import datetime

business_bp = Blueprint("business_bp", __name__, template_folder="templates")

@business_bp.route("/view")
def business_view():
    # Resumo básico para o dashboard
    info = {
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "services": {
            "api": True,
            "affiliates": True,   # pode ser enriquecido com checagens reais
            "payments": True,
            "media_ai": True,
            "autopost": True,
            "trends": True,
        }
    }
    return render_template("business_view.html", info=info)

@business_bp.route("/audit_logs")
def audit_logs():
    # Exemplo simples: responder com um array de logs em memória/placeholder
    sample = [
        {"time": datetime.utcnow().isoformat()+"Z", "actor": "admin", "action": "login"},
        {"time": datetime.utcnow().isoformat()+"Z", "actor": "system", "action": "cron.media_ai"},
    ]
    return jsonify(sample)

@business_bp.route("/health")
def health():
    return jsonify({"status": "ok", "ts": datetime.utcnow().isoformat()+"Z"})

@business_bp.route("/status")
def status():
    return jsonify({
        "ok": True,
        "services": ["api", "affiliates", "payments", "media_ai", "autopost", "trends"],
    })


business_bp = Blueprint("business_bp", __name__, url_prefix="/business")

# ============================================
# 🏛️ Painel principal — Business View
# ============================================
@business_bp.route("/view")
@require_token
def business_view():
    return render_template("dashboard/business_view.html")

# ============================================
# ⚙️ Painel administrativo — Atalhos + Logs
# ============================================
@business_bp.route("/admin")
@require_token
def admin_dashboard():
    atalhos = [
        {"nome": "📊 Business View", "url": "/business/view"},
        {"nome": "📈 Affiliates Intel", "url": "/business/affiliates_intel"},
        {"nome": "🎬 Media AI", "url": "/business/media"},
        {"nome": "🤖 AutoPost", "url": "/business/autopost"},
        {"nome": "🧭 Trends", "url": "/business/trends"},
        {"nome": "💰 Pagamentos", "url": "/business/payments"},
        {"nome": "👁️ Monitoramento", "url": "/business/audit_logs"},
    ]
    return render_template("dashboard/admin.html", atalhos=atalhos)

# ============================================
# 👁️ Monitoramento de Acesso — Visualização
# ============================================
@business_bp.route("/audit_logs")
@require_token
def audit_logs():
    """Exibe o painel visual de logs administrativos."""
    db = get_db()

    # Filtros
    usuario = request.args.get("usuario")
    acao = request.args.get("acao")
    data_ini = request.args.get("data_ini")
    data_fim = request.args.get("data_fim")

    query = db.query(AdminLog)

    if usuario:
        query = query.filter(AdminLog.usuario.ilike(f"%{usuario}%"))
    if acao:
        query = query.filter(AdminLog.acao == acao)
    if data_ini:
        query = query.filter(AdminLog.data >= datetime.strptime(data_ini, "%Y-%m-%d"))
    if data_fim:
        query = query.filter(AdminLog.data <= datetime.strptime(data_fim, "%Y-%m-%d"))

    logs = query.order_by(AdminLog.data.desc()).limit(200).all()
    return render_template("dashboard/audit_logs.html", logs=logs)

# ============================================
# 📤 Exportar CSV
# ============================================
@business_bp.route("/audit_logs/export")
@require_token
def export_audit_logs():
    """Exporta os logs filtrados em formato CSV."""
    db = get_db()
    logs = db.query(AdminLog).order_by(AdminLog.data.desc()).all()

    si = StringIO()
    writer = csv.writer(si)
    writer.writerow(["Data", "Usuário", "Ação", "IP", "Navegador"])
    for log in logs:
        writer.writerow([
            log.data.strftime("%d/%m/%Y %H:%M"),
            log.usuario,
            log.acao,
            log.ip,
            log.navegador
        ])

    output = make_csv_response(si.getvalue(), "logs_familia.csv")
    return output


def make_csv_response(csv_data, filename):
    """Gera a resposta de download em CSV."""
    return Response(
        csv_data,
        mimetype="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
            "Cache-Control": "no-store"
        }
    )

# ============================================
# ⚠️ Sessão Expirada
# ============================================
@business_bp.route("/expired")
def session_expired():
    return render_template("dashboard/session_expired.html")
