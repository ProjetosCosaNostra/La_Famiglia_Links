import os
import random
import requests
import json
import time
import schedule
from datetime import datetime
from notifier import send_telegram_message

# =====================================================
# 🎩 COSA NOSTRA — SISTEMA DE AUTOMAÇÃO COMPLETA
# =====================================================
# Funções:
#  - Pesquisa tendências
#  - Escolhe produtos afiliados
#  - Gera postagens automáticas
#  - Envia notificação no Telegram
#  - Executa automaticamente N vezes por dia
# =====================================================

# CONFIGURAÇÕES PRINCIPAIS
AMAZON_AFFILIATE_URL = "https://amzn.to/4h0gnbW"
MERCADO_LIVRE_AFFILIATE_URL = "https://www.mercadolivre.com.br/social/felipecosanostra"
OUTPUT_DIR = "E:/La_Famiglia_Links/backend/generated_posts"

# GARANTE QUE A PASTA EXISTE
os.makedirs(OUTPUT_DIR, exist_ok=True)

# =====================================================
# 1️⃣ GERADOR DE TENDÊNCIAS
# =====================================================
def get_trending_topic():
    topics = [
        "tecnologia", "games", "filmes e séries", "produtividade",
        "ferramentas criativas", "acessórios para criadores de conteúdo",
        "inteligência artificial", "novidades em smartphones",
        "setup gamer", "microfones e iluminação"
    ]
    return random.choice(topics)

# =====================================================
# 2️⃣ ESCOLHA DE PRODUTO AFILIADO
# =====================================================
def get_affiliate_product(topic):
    if random.choice([True, False]):
        platform = "Amazon"
        url = AMAZON_AFFILIATE_URL
    else:
        platform = "Mercado Livre"
        url = MERCADO_LIVRE_AFFILIATE_URL

    return {
        "platform": platform,
        "title": f"Oferta em alta: {topic.title()} 🔥",
        "description": f"Descubra o melhor em {topic} com descontos exclusivos da Família Cosa Nostra!",
        "url": url
    }

# =====================================================
# 3️⃣ GERAÇÃO DA POSTAGEM
# =====================================================
def create_post():
    topic = get_trending_topic()
    product = get_affiliate_product(topic)

    post_data = {
        "topic": topic,
        "product": product,
        "timestamp": datetime.now().strftime("%d/%m/%Y %H:%M:%S")
    }

    file_name = f"{OUTPUT_DIR}/post_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    with open(file_name, "w", encoding="utf-8") as f:
        json.dump(post_data, f, ensure_ascii=False, indent=2)

    message = (
        f"🎩 *Nova publicação automática!*\n\n"
        f"🧠 Tema: *{topic.title()}*\n"
        f"🛒 Plataforma: *{product['platform']}*\n"
        f"🔗 [Ver produto]({product['url']})\n\n"
        f"📅 {post_data['timestamp']}"
    )
    send_telegram_message(message)
    print(f"✅ Postagem criada com sucesso: {file_name}")

# =====================================================
# 4️⃣ AGENDADOR AUTOMÁTICO
# =====================================================
def schedule_posts(times_per_day=3):
    """Agenda publicações automáticas conforme número diário"""
    interval = 24 * 60 / times_per_day  # minutos entre posts
    schedule.every(interval).minutes.do(create_post)
    send_telegram_message(f"🕒 Agendador iniciado: {times_per_day} publicações por dia.")

    print(f"🎩 Agendador Cosa Nostra iniciado — {times_per_day} posts por dia.")
    print("♟️ Aguardando o horário das próximas publicações...\n")

    while True:
        schedule.run_pending()
        time.sleep(30)

# =====================================================
# 5️⃣ EXECUÇÃO DIRETA
# =====================================================
if __name__ == "__main__":
    print("🎩 COSA NOSTRA — AUTOMATIZAÇÃO INTELIGENTE ATIVA")
    try:
        posts_por_dia = int(input("📅 Quantos posts por dia deseja gerar automaticamente? "))
    except:
        posts_por_dia = 3  # padrão
        print("Usando valor padrão: 3 posts/dia")

    create_post()  # cria um de teste imediato
    schedule_posts(posts_por_dia)
