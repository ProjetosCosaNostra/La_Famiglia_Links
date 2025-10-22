# backend/utils/notifier.py
import requests
import os
from datetime import datetime

# 🔐 Pega variáveis de ambiente configuradas no Render
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID")

def enviar_notificacao(mensagem: str):
    """
    Envia uma notificação via Telegram Bot.
    Pode ser usada por qualquer módulo do sistema (deploy, automação, erros, etc.)
    """
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        print("⚠️ TELEGRAM_BOT_TOKEN ou TELEGRAM_CHAT_ID não configurados.")
        return False

    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    data = {
        "chat_id": TELEGRAM_CHAT_ID,
        "text": mensagem,
        "parse_mode": "Markdown"
    }

    try:
        response = requests.post(url, data=data)
        if response.status_code == 200:
            print(f"✅ Notificação enviada: {mensagem}")
            return True
        else:
            print(f"❌ Erro ao enviar notificação: {response.text}")
            return False
    except Exception as e:
        print(f"🚨 Erro no envio da notificação: {e}")
        return False


def notificar_inicio_servidor():
    """
    Envia uma mensagem automática ao iniciar o servidor (Render ou local).
    """
    hora = datetime.now().strftime("%d/%m/%Y %H:%M:%S")
    mensagem = (
        f"🎩 *Servidor iniciado com sucesso!*\n\n"
        f"🕒 `{hora}`\n"
        f"🚀 Sistema La Famiglia Links ativo."
    )
    enviar_notificacao(mensagem)
