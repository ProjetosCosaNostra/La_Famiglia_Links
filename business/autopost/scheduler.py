# business/autopost/scheduler.py
from apscheduler.schedulers.background import BackgroundScheduler
from datetime import datetime
import random

from models.database import get_db
from business.media_ai.models import BannerGerado, VideoGerado
from .routes import _safe_call, _mafioso_caption
from .services.instagram_service import post_image, post_video
from .services.youtube_service import post_short
from .services.kwai_service import post_video as kwai_post_video
from .models import AutopostLog

scheduler = BackgroundScheduler()

def autopost_diario():
    db = get_db()
    banners = db.query(BannerGerado).order_by(BannerGerado.id.desc()).limit(10).all()
    videos = db.query(VideoGerado).order_by(VideoGerado.id.desc()).limit(10).all()

    escolhidos = random.sample(banners, k=min(1, len(banners))) + random.sample(videos, k=min(1, len(videos)))

    for item in escolhidos:
        tipo = "banner" if isinstance(item, BannerGerado) else "video"
        legenda = _mafioso_caption(item.titulo, "", None, None)
        print(f"[{datetime.now()}] 🚀 AutoPost: {tipo.upper()} -> {item.arquivo}")

        # Publica nas redes (simulação até integração real)
        if tipo == "banner":
            _safe_call(post_image, item.arquivo, legenda)
        else:
            _safe_call(post_video, item.arquivo, legenda)
            _safe_call(post_short, item.arquivo, legenda)
            _safe_call(kwai_post_video, item.arquivo, legenda)

        log = AutopostLog(
            rede="auto",
            midia_tipo=tipo,
            arquivo=item.arquivo,
            legenda=legenda,
            status="ok",
            detalhe="Postagem automática diária.",
        )
        db.add(log)
        db.commit()

def iniciar_autopost_scheduler():
    scheduler.add_job(autopost_diario, "cron", hour=11, minute=0)
    scheduler.start()
    print("⚙️ AutoPost Scheduler iniciado — postagens automáticas diárias ativas.")
