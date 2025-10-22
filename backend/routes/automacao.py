from flask import Blueprint, request, jsonify
from utils.automator import gerar_post_automatico, agendar_posts
from utils.notifier import enviar_notificacao
import threading

automacao_bp = Blueprint('automacao_bp', __name__)

# ============================
# 📦 GERAR POST AUTOMÁTICO
# ============================
@automacao_bp.route('/automacao/gerar', methods=['POST'])
def gerar_post():
    try:
        data = request.get_json() or {}
        quantidade = int(data.get('quantidade', 1))

        resultados = []
        for i in range(quantidade):
            post = gerar_post_automatico()
            resultados.append(post)

        enviar_notificacao(f"✅ {quantidade} post(s) gerado(s) com sucesso!")
        return jsonify({
            "status": "success",
            "mensagem": f"{quantidade} post(s) gerado(s) com sucesso!",
            "resultados": resultados
        }), 200

    except Exception as e:
        enviar_notificacao(f"❌ Erro ao gerar post automático: {e}")
        return jsonify({
            "status": "error",
            "mensagem": str(e)
        }), 500


# ============================
# 🕒 AGENDAR POSTS AUTOMÁTICOS
# ============================
@automacao_bp.route('/automacao/agendar', methods=['POST'])
def agendar():
    try:
        data = request.get_json() or {}
        posts_por_dia = int(data.get('posts_por_dia', 1))

        # Usa thread para rodar em paralelo (não travar o servidor)
        agendamento_thread = threading.Thread(target=agendar_posts, args=(posts_por_dia,))
        agendamento_thread.start()

        enviar_notificacao(f"📅 Automação iniciada: {posts_por_dia} post(s) por dia.")
        return jsonify({
            "status": "success",
            "mensagem": f"Automação agendada para {posts_por_dia} post(s) por dia."
        }), 200

    except Exception as e:
        enviar_notificacao(f"❌ Erro ao agendar automação: {e}")
        return jsonify({
            "status": "error",
            "mensagem": str(e)
        }), 500


# ============================
# 📊 STATUS DA AUTOMAÇÃO
# ============================
@automacao_bp.route('/automacao/status', methods=['GET'])
def status():
    try:
        from utils.automator import status_automacao
        status_atual = status_automacao()
        return jsonify({
            "status": "success",
            "automacao": status_atual
        }), 200

    except Exception as e:
        return jsonify({
            "status": "error",
            "mensagem": str(e)
        }), 500
