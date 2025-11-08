# ============================================
# 🎩 La Famiglia Links — Painel de Relatórios Premium
# ============================================

from flask import Blueprint, render_template, jsonify, send_file
import pandas as pd
import io
from datetime import datetime
from models.database import get_db_connection

reports_bp = Blueprint("reports_bp", __name__, template_folder="templates")

# ============================================
# 🧭 PAINEL PRINCIPAL DE RELATÓRIOS
# ============================================
@reports_bp.route("/")
def dashboard():
    """Exibe o painel de relatórios premium."""
    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT date(created_at) as dia, COUNT(*) as total
        FROM links
        GROUP BY date(created_at)
        ORDER BY dia DESC
        LIMIT 7
    """)
    data = cur.fetchall()
    conn.close()

    dias = [r["dia"] for r in data]
    valores = [r["total"] for r in data]

    return render_template("reports_dashboard.html", dias=dias[::-1], valores=valores[::-1])


# ============================================
# 📈 API — Dados para o gráfico AJAX
# ============================================
@reports_bp.route("/api/data", methods=["GET"])
def api_data():
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT date(created_at) as dia, COUNT(*) as total
        FROM links
        GROUP BY date(created_at)
        ORDER BY dia DESC
        LIMIT 7
    """)
    data = cur.fetchall()
    conn.close()
    return jsonify(data)


# ============================================
# 🧾 EXPORTAR RELATÓRIO — PDF
# ============================================
@reports_bp.route("/export/pdf", methods=["GET"])
def export_pdf():
    conn = get_db_connection()
    df = pd.read_sql_query("SELECT * FROM links", conn)
    conn.close()

    from reportlab.lib.pagesizes import letter
    from reportlab.pdfgen import canvas

    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=letter)
    pdf.setTitle("Relatório da Família")

    pdf.setFont("Helvetica-Bold", 16)
    pdf.drawString(200, 750, "Relatório da Família — La Famiglia Links")

    pdf.setFont("Helvetica", 10)
    y = 720
    for _, row in df.iterrows():
        pdf.drawString(50, y, f"Nome: {row['nome']} | URL: {row['url']} | Criado em: {row['created_at']}")
        y -= 15
        if y < 50:
            pdf.showPage()
            y = 750

    pdf.save()
    buffer.seek(0)
    return send_file(buffer, as_attachment=True, download_name="relatorio_famiglia.pdf", mimetype="application/pdf")


# ============================================
# 💼 EXPORTAR RELATÓRIO — EXCEL
# ============================================
@reports_bp.route("/export/excel", methods=["GET"])
def export_excel():
    conn = get_db_connection()
    df = pd.read_sql_query("SELECT * FROM links", conn)
    conn.close()

    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="xlsxwriter") as writer:
        df.to_excel(writer, index=False, sheet_name="Relatório")
    output.seek(0)
    return send_file(output, as_attachment=True, download_name="relatorio_famiglia.xlsx", mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
