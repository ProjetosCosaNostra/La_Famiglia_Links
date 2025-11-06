import requests
import os
from dotenv import load_dotenv

load_dotenv()
HF_KEY = os.getenv("HUGGINGFACE_API_KEY", "")

def gerar_descricao_ia(produto):
    """Gera descrição de marketing cinematográfica via API HuggingFace."""
    if not HF_KEY:
        return f"{produto} — Elegância e poder em cada detalhe. Escolha da Família."

    url = "https://api-inference.huggingface.co/models/gpt2"
    headers = {"Authorization": f"Bearer {HF_KEY}"}
    payload = {"inputs": f"Crie uma frase de venda elegante e poderosa para o produto: {produto}"}

    try:
        response = requests.post(url, headers=headers, json=payload, timeout=15)
        result = response.json()
        texto = result[0]["generated_text"]
        return texto.strip()
    except Exception:
        return f"{produto} — Exclusividade e respeito em cada uso."
