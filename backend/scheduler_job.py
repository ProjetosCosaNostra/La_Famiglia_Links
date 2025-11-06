from apscheduler.schedulers.background import BackgroundScheduler
from datetime import datetime
import random
import os

from business.media_ai.video_generator import gerar_video_publicitario
from business.media_ai.models import inserir_video

scheduler = BackgroundScheduler()

# ============================================================
# ⚜️ JOB PRINCIPAL — GERA 2 VÍDEOS POR DIA AUTOMATICAMENTE
# ============================================================
def gerar_videos_diarios():
    """Gera automaticamente vídeos diários com base em produtos predefinidos."""
    produtos = [
        {
            "titulo": "Relógio Dourado",
            "descricao": "Poder, elegância e respeito. A escolha dos aliados.",
            "imagem": "static/generated/relogio_dourado.png"
        },
        {
            "titulo": "Canivete Tático Elite",
            "descricao": "Precisão em cada lâmina. Feito para os que comandam.",
            "imagem": "static/generated/canivete_elite.png"
        },
        {
            "titulo": "Carteira de Couro Nera",
            "descricao": "Discrição e autoridade em cada detalhe.",
            "imagem": "static/generated/carteira_nera.png"
        }
    ]

    escolhidos = random.sample(produtos, k=min(2, len(produtos)))
    for item in escolhidos:
        try:
            video_path = gerar_video_publicitario(item["titulo"], item["descricao"], item["imagem"])
            inserir_video(item["titulo"], item["descricao"], item["imagem"], video_path)
            print(f"[{datetime.now()}] ✅ Vídeo automático gerado: {item['titulo']}")
        except Exception as e:
            print(f"[{datetime.now()}] ❌ Falha ao gerar vídeo: {e}")

# ============================================================
# 🕰️ AGENDAMENTO DIÁRIO
# ============================================================
def iniciar_scheduler():
    """Inicia o agendador em background."""
    scheduler.add_job(gerar_videos_diarios, "cron", hour=10, minute=0)  # executa às 10h da manhã
    scheduler.start()
    print("⚙️ Scheduler da Família iniciado — vídeos automáticos ativados.")
