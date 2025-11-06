# ============================================
# ⚙️ LA FAMIGLIA LINKS — Scheduler de Mídia IA
# Gera automaticamente banners e vídeos diários
# ============================================

from apscheduler.schedulers.background import BackgroundScheduler
from datetime import datetime
import random
import os

from business.media_ai.video_generator import gerar_video_publicitario
from business.media_ai.text_overlay import gerar_banner_com_texto
from business.media_ai.models import inserir_video, inserir_banner

# Banco para buscar produtos de afiliados recentes
from business.affiliates_intel.models import listar_produtos

scheduler = BackgroundScheduler()

# ============================================================
# 🎬 FUNÇÃO PRINCIPAL — GERAR CONTEÚDO AUTOMÁTICO
# ============================================================
def gerar_midia_diaria():
    """
    Escolhe produtos recentes e gera automaticamente:
    - 1 banner com texto cinematográfico
    - 1 vídeo curto publicitário 9:16
    """
    try:
        produtos = listar_produtos(limit=5)
        if not produtos:
            print(f"[{datetime.now()}] ⚠️ Nenhum produto disponível para gerar mídia.")
            return

        escolhido = random.choice(produtos)
        id_prod, source, external_id, title, price, currency, url, image, affiliate_url, created_at = escolhido

        descricao = f"Direto de {source.title()} — {title}. Poder e exclusividade por apenas {currency} {price:.2f}."

        # 🖼️ Gera banner
        banner_path = gerar_banner_com_texto(image, title, descricao)
        inserir_banner(title, descricao, image, banner_path)

        # 🎬 Gera vídeo
        video_path = gerar_video_publicitario(title, descricao, banner_path)
        inserir_video(title, descricao, banner_path, video_path)

        print(f"[{datetime.now()}] ✅ Mídia automática gerada: {title}")

    except Exception as e:
        print(f"[{datetime.now()}] ❌ Falha ao gerar mídia automática: {e}")


# ============================================================
# 🕰️ AGENDAMENTO AUTOMÁTICO
# ============================================================
def iniciar_scheduler_midia():
    """
    Inicia o agendador em background.
    Gera mídia todo dia às 11h.
    """
    try:
        scheduler.add_job(gerar_midia_diaria, "cron", hour=11, minute=0)
        scheduler.start()
        print("🎥 Scheduler de Mídia IA iniciado — geração diária automática ativada.")
    except Exception as e:
        print(f"⚠️ Falha ao iniciar scheduler de mídia: {e}")
