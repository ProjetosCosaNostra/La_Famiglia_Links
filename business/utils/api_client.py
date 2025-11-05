# ============================================
# 🤖 LA FAMIGLIA API CLIENT
# Comunicação entre o Flask e os microserviços de IA
# ============================================
import requests
import logging

# URLs internas (usadas dentro do docker-compose)
AI_TEXT_URL = "http://ai-service:8000"
AI_IMAGE_URL = "http://ai-image:8500"

# Configuração de logs
logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(levelname)s - %(message)s")
logger = logging.getLogger("LaFamigliaAPIClient")


# ======================================================
# 🧠 IA TEXTUAL — análise de tendências, resumos, ideias
# ======================================================
def analyze_text(prompt: str):
    """Envia um texto para o serviço de IA textual e retorna a análise."""
    try:
        response = requests.post(f"{AI_TEXT_URL}/analyze", json={"text": prompt}, timeout=20)
        if response.status_code == 200:
            data = response.json()
            logger.info(f"🧠 IA Textual retornou: {data}")
            return data
        else:
            logger.error(f"❌ Erro IA Textual: {response.text}")
            return {"erro": f"Falha ao analisar texto: {response.text}"}
    except requests.exceptions.RequestException as e:
        logger.error(f"⚠️ Erro de comunicação com IA Textual: {e}")
        return {"erro": str(e)}


# ======================================================
# 🎨 IA VISUAL — geração de imagens (Stable Diffusion)
# ======================================================
def generate_image(prompt: str, width=512, height=512, steps=20):
    """Gera uma imagem a partir de um prompt textual."""
    payload = {
        "prompt": prompt,
        "width": width,
        "height": height,
        "num_inference_steps": steps,
    }
    try:
        response = requests.post(f"{AI_IMAGE_URL}/generate", json=payload, timeout=120)
        if response.status_code == 200:
            data = response.json()
            logger.info("🖼️ Imagem gerada com sucesso pela IA.")
            return data
        else:
            logger.error(f"❌ Erro na geração de imagem: {response.text}")
            return {"erro": f"Falha ao gerar imagem: {response.text}"}
    except requests.exceptions.RequestException as e:
        logger.error(f"⚠️ Erro de comunicação com IA de imagem: {e}")
        return {"erro": str(e)}


# ======================================================
# 🔎 STATUS — verifica se os serviços estão online
# ======================================================
def check_status():
    """Retorna o status atual de ambos os serviços de IA."""
    status = {"text_service": "offline", "image_service": "offline"}
    try:
        res_text = requests.get(f"{AI_TEXT_URL}/status", timeout=5)
        if res_text.status_code == 200:
            status["text_service"] = "online"
    except Exception:
        pass

    try:
        res_img = requests.get(f"{AI_IMAGE_URL}/status", timeout=5)
        if res_img.status_code == 200:
            status["image_service"] = "online"
    except Exception:
        pass

    logger.info(f"📡 Status IA: {status}")
    return status


# ======================================================
# 🧩 Função utilitária geral — uso rápido no Business
# ======================================================
def gerar_post_com_imagem(produto_nome: str, plataforma: str):
    """
    Exemplo de uso integrado: cria texto + imagem
    para post automático do painel Business.
    """
    prompt_textual = f"Crie uma descrição chamativa para o produto '{produto_nome}' da {plataforma}, com tom elegante e misterioso da máfia."
    texto = analyze_text(prompt_textual)
    prompt_visual = f"Um cenário cinematográfico dourado com o produto {produto_nome}, estilo Cosa Nostra, fundo preto e dourado."
    imagem = generate_image(prompt_visual)
    return {
        "produto": produto_nome,
        "plataforma": plataforma,
        "descricao": texto.get("input", "Descrição não gerada."),
        "imagem_base64": imagem.get("image_base64")
    }
