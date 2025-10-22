import json
import os
import random
import time
import threading
from datetime import datetime
from utils.notifier import enviar_notificacao

# Caminho para logs e dados
DATA_DIR = os.path.join(os.path.dirname(__file__), "../data")
LOG_FILE = os.path.join(DATA_DIR, "automacao_log.json")

# Controle interno
AUTOMACAO_ATIVA = False
ULTIMA_EXECUCAO = None
POSTS_GERADOS_HOJE = 0
POSTS_POR_DIA = 1


# =====================================================
# 🧩 Função: Gerar um post automático
# =====================================================
def gerar_post_automatico():
    global POSTS_GERADOS_HOJE, ULTIMA_EXECUCAO

    ideias = [
        {
            "titulo": "Honra e Palavra — os pilares da Família.",
            "descricao": "Na Cosa Nostra, cada palavra é um contrato. 🎩",
            "hashtags": ["#Família", "#Honra", "#Respeito", "#CosaNostra"]
        },
        {
            "titulo": "O Capo da Criação fala...",
            "descricao": "Criação é estratégia, disciplina e alma. ♟️",
            "hashtags": ["#Criação", "#Estratégia", "#CulturaPop", "#CapoDaCriação"]
        },
        {
            "titulo": "Família unida nunca cai.",
            "descricao": "Na dúvida, lembre-se do lema: Respeito, lealdade e honra.",
            "hashtags": ["#LaFamiglia", "#Respeito", "#Lealdade", "#CosaNostra"]
        }
    ]

    post = random.choice(ideias)
    ULTIMA_EXECUCAO = datetime.now().strftime("%d/%m/%Y %H:%M:%S")
    POSTS_GERADOS_HOJE += 1

    # Registra no log
    salvar_log({
        "data": ULTIMA_EXECUCAO,
        "titulo": post["titulo"],
        "descricao": post["descricao"],
        "hashtags": post["hashtags"]
    })

    enviar_notificacao(f"🧠 Novo post automático criado!\n\n📜 *{post['titulo']}*\n🕒 {ULTIMA_EXECUCAO}")
    return post


# =====================================================
# 🗓️ Função: Agendar posts diários
# =====================================================
def agendar_posts(posts_por_dia=1):
    global AUTOMACAO_ATIVA, POSTS_POR_DIA
    AUTOMACAO_ATIVA = True
    POSTS_POR_DIA = posts_por_dia

    enviar_notificacao(f"⏰ Automação iniciada — {posts_por_dia} post(s) por dia.")

    def ciclo_diario():
        global AUTOMACAO_ATIVA, POSTS_GERADOS_HOJE
        while AUTOMACAO_ATIVA:
            POSTS_GERADOS_HOJE = 0
            for i in range(POSTS_POR_DIA):
                gerar_post_automatico()
                time.sleep(60 * 60 * 6)  # Espera 6 horas entre cada post

            enviar_notificacao("🌙 Ciclo de automação finalizado. Novos posts amanhã.")
            time.sleep(60 * 60 * 24)  # Espera 24h para o próximo dia

    thread = threading.Thread(target=ciclo_diario)
    thread.daemon = True
    thread.start()


# =====================================================
# 🧾 Função: Registrar logs
# =====================================================
def salvar_log(post_data):
    os.makedirs(DATA_DIR, exist_ok=True)
    logs = []

    if os.path.exists(LOG_FILE):
        try:
            with open(LOG_FILE, "r", encoding="utf-8") as f:
                logs = json.load(f)
        except json.JSONDecodeError:
            logs = []

    logs.append(post_data)
    with open(LOG_FILE, "w", encoding="utf-8") as f:
        json.dump(logs, f, indent=2, ensure_ascii=False)


# =====================================================
# 📊 Função: Retornar status atual da automação
# =====================================================
def status_automacao():
    return {
        "ativa": AUTOMACAO_ATIVA,
        "posts_por_dia": POSTS_POR_DIA,
        "posts_gerados_hoje": POSTS_GERADOS_HOJE,
        "ultima_execucao": ULTIMA_EXECUCAO
    }


# =====================================================
# 🧨 Função: Parar automação (se necessário)
# =====================================================
def parar_automacao():
    global AUTOMACAO_ATIVA
    AUTOMACAO_ATIVA = False
    enviar_notificacao("🛑 Automação pausada manualmente pela administração.")
