# business/media_ai/scheduler.py
from apscheduler.schedulers.background import BackgroundScheduler
from datetime import datetime
import random
from models.database import get_db
from business.affiliates.models import ProdutoAfiliado
from .post_generator import gerar_banner_produto
from .video_generator import gerar_video_publicitario
from .models import BannerGerado, VideoGerado

scheduler = BackgroundScheduler()

def gerar_midias_afiliados_diario():
    db = get_db()
    produtos = db.query(ProdutoAfiliado).order_by(ProdutoAfiliado.id.desc()).limit(6).all()
    if not produtos:
        print(f"[{datetime.now()}] ⚠️ Nenhum produto afiliado para gerar mídias.")
        return
    escolhidos = random.sample(produtos, k=min(2, len(produtos)))
    for p in escolhidos:
        try:
            # Banner
            bpath = gerar_banner_produto(p.nome, float(p.preco or 0), p.imagem)
            b = BannerGerado(titulo=p.nome, preco_txt=f"R$ {p.preco:,.2f}".replace(",", "X").replace(".", ",").replace("X", "."),
                             imagem_origem=p.imagem, arquivo=bpath)
            db.add(b)

            # Vídeo curto
            desc = f"{p.nome} — poder silencioso. A escolha dos aliados."
            vpath = gerar_video_publicitario(p.nome, desc, p.imagem)
            v = VideoGerado(titulo=p.nome, descricao=desc, imagem_origem=p.imagem, arquivo=vpath)
            db.add(v)
            db.commit()
            print(f"[{datetime.now()}] ✅ Mídias geradas para: {p.nome}")
        except Exception as e:
            db.rollback()
            print(f"[{datetime.now()}] ❌ Falha ao gerar mídias: {e}")

def iniciar_scheduler():
    # Executa todos os dias às 10h
    scheduler.add_job(gerar_midias_afiliados_diario, "cron", hour=10, minute=0)
    scheduler.start()
    print("⚙️ Scheduler de mídias dos afiliados — ATIVO.")
