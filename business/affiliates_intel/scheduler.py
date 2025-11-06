# ============================================================
# ⏰ Scheduler de Coleta Automática (Afiliados)
# Executa diariamente buscas e grava no banco
# ============================================================

import os
from apscheduler.schedulers.background import BackgroundScheduler
from .services import search_products
from .models import insert_product, ensure_tables

scheduler_aff = BackgroundScheduler()

def _queries_base():
    """
    Lista de termos monitorados diariamente.
    Pode vir de env AFFILIATES_QUERIES="relógio,canivete,carteira couro"
    """
    raw = os.getenv("AFFILIATES_QUERIES", "relógio dourado, carteira couro, canivete tático")
    return [q.strip() for q in raw.split(",") if q.strip()]

def job_coletar_diario():
    ensure_tables()
    terms = _queries_base()
    for q in terms:
        try:
            results = search_products(q, sources=("mercado_livre","amazon"), limit=8)
            for r in results:
                insert_product(r)
            print(f"✅ Affiliates Intel: coletou {len(results)} itens para '{q}'")
        except Exception as e:
            print(f"❌ Falha coleta '{q}': {e}")

def iniciar_affiliates_scheduler():
    try:
        scheduler_aff.add_job(job_coletar_diario, "cron", hour=9, minute=0)
        scheduler_aff.start()
        print("⚙️ Scheduler Affiliates Intel iniciado.")
    except Exception as e:
        print(f"⚠️ Não foi possível iniciar scheduler de afiliados: {e}")
