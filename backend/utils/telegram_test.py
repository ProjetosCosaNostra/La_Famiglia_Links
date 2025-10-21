import requests

TOKEN = "8466321537:AAFGLohDQO2FznF0kciwUP-bWtTFjrcmvOw"   # ex: 123456:ABC...
CHAT_ID = "8222271932"  # ex: 512345678

def send_test():
    url = f"https://api.telegram.org/bot{TOKEN}/sendMessage"
    payload = {
        "chat_id": CHAT_ID,
        "text": "Teste da Cosa Nostra — notificação automática ✅"
    }
    r = requests.post(url, data=payload, timeout=10)
    print(r.status_code, r.text)

if __name__ == "__main__":
    send_test()
