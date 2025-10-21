import requests
import json
import os
from datetime import datetime

# === Caminho do arquivo de configuração ===
CONFIG_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "config.json")

# === Carrega configurações do Bot ===
def load_config():
    if not os.path.exists(CONFIG_PATH):
        print("⚠️ Arquivo config.json não encontrado. Criando exemplo padrão...")
        default_config = {
            "telegram_bot_token": "",
            "telegram_chat_id": "",
            "notify_enabled": True
        }
        os.makedirs(os.path.dirname(CONFIG_PATH), exist_ok=True)
        with open(CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump(default_config, f, indent=4, ensure_ascii=False)
        return default_config

    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        return json.load(f)

CONFIG = load_config()

# === Função principal para enviar mensagens ao Telegram ===
def send_message_to_telegram(message: str):
    """Envia uma mensagem formatada ao chat configurado"""
    if not CONFIG.get("notify_enabled", True):
        return False

    bot_token = CONFIG.get("telegram_bot_token")
    chat_id = CONFIG.get("telegram_chat_id")

    if not bot_token or not chat_id:
        print("⚠️ Bot token ou chat_id não configurados.")
        return False

    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": message,
        "parse_mode": "Markdown"
    }

    try:
        response = requests.post(url, json=payload, timeout=10)
        if response.status_code == 200:
            print(f"✅ Mensagem enviada com sucesso: {message[:60]}...")
            return True
        else:
            print(f"❌ Erro ao enviar: {response.text}")
            return False
    except Exception as e:
        print(f"🔥 Falha ao conectar ao Telegram: {e}")
        return False

# === Função de notificação estilizada ===
def notify_event(event_type: str, details: str = ""):
    """Envia mensagem formatada com base no tipo de evento"""
    icons = {
        "start": "🚀 *Servidor iniciado!*",
        "db_ready": "💾 *Banco de dados inicializado!*",
        "new_post": "📰 *Novo post automático publicado!*",
        "affiliate_sale": "💰 *Venda afiliada detectada!*",
        "error": "⚠️ *Erro detectado!*",
        "ai_task": "🤖 *IA gerou novo conteúdo!*",
        "shutdown": "🛑 *Servidor encerrado!*",
    }

    title = icons.get(event_type, f"📢 *{event_type.capitalize()}*")
    timestamp = datetime.now().strftime("%d/%m/%Y %H:%M:%S")
    message = f"{title}\n\n🕒 `{timestamp}`\n\n{details}"

    return send_message_to_telegram(message)

# === Teste rápido ===
if __name__ == "__main__":
    print("🎩 Testando sistema de notificações Cosa Nostra...")
    success = notify_event("start", "O sistema La Famiglia foi iniciado com sucesso.")
    if success:
        print("✅ Notificação enviada com sucesso.")
    else:
        print("❌ Falha ao enviar notificação.")
