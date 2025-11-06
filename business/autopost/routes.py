# business/autopost/routes.py
# ============================================
# 🎩 La Famiglia Links — AutoPost (IA + Redes)
# Publicação automática de banners e vídeos
# ============================================

from flask import Blueprint, jsonify, request, render_template
from datetime import datetime
from typing import Optional, Dict, Any
import traceback

from models.database import get_db
# Mídias geradas pela IA
from business.media_ai.models import BannerGerado, VideoGerado
# Jobs e Contas (serão criados na próxima etapa em business/autopost/models.py)
try:
    from .models import AutopostJob, SocialAccount
except Exception:
    AutopostJob = None
    SocialAccount = None

# Serviços de postagem (cada um terá publish_image / publish_video)
# Serão implementados em business/autopost/services/*.py
try:
    from .services.instagram_service import publish_image as ig_img, publish_video as ig_vid
except Exception:
    ig_img = ig_vid = None
try:
    from .services.youtube_service import publish_video as yt_vid
except Exception:
    yt_vid = None
try:
    from .services.kwai_service import publish_video as kw_vid
except Exception:
    kw_vid = None

autopost_bp = Blueprint("autopost_bp", __name__, url_prefix="/business/autopost")


# ============================================
# 🧠 Helpers
# ============================================

def _cinematic_caption(title: str, price: Optional[str] = None, link: Optional[str] = None) -> str:
    """Fallback de legenda cinematográfica caso IA externa não esteja disponível."""
    base = f"{title} — presença, respeito e estratégia."
    if price:
        base += f" 💰 {price}"
    hashtags = "#LaFamiglia #CosaNostra #Elegância #Estilo #Oficial #OndeOsAliadosSeConectam"
    if link:
        return f"{base}\n{link}\n{hashtags}"
    return f"{base}\n{hashtags}"


def _select_service(rede: str):
    """
    Retorna funções (publish_image, publish_video) para a rede informada.
    Cada função deve retornar dict: { 'ok': bool, 'url'?: str, 'error'?: str }
    """
    rede = (rede or "").lower()
    if rede in ("instagram", "ig"):
        return ig_img, ig_vid
    if rede in ("youtube", "yt", "shorts"):
        return None, yt_vid
    if rede in ("kwai",):
        return None, kw_vid
    # TikTok pode ser adicionado depois
    return None, None


def _find_account(db, rede: str) -> Optional["SocialAccount"]:
    if not SocialAccount:
        return None
    return db.query(SocialAccount).filter(SocialAccount.platform == rede.lower()).first()


def _json_error(msg: str, code: int = 400):
    return jsonify({"ok": False, "error": msg}), code


# ============================================
# 📊 Dashboard (HTML)
# ============================================
@autopost_bp.route("/", methods=["GET"])
def dashboard():
    """Painel simples (será preenchido no template em etapa seguinte)."""
    db = get_db()
    banners = db.query(BannerGerado).order_by(BannerGerado.id.desc()).limit(20).all()
    videos = db.query(VideoGerado).order_by(VideoGerado.id.desc()).limit(20).all()

    return render_template(
        "autopost_dashboard.html",
        banners=banners,
        videos=videos,
    )


# ============================================
# 🔎 Status / Health
# ============================================
@autopost_bp.route("/api/status", methods=["GET"])
def status():
    return jsonify({
        "ok": True,
        "module": "autopost",
        "services": {
            "instagram": bool(ig_img and ig_vid),
            "youtube": bool(yt_vid),
            "kwai": bool(kw_vid),
        }
    })


# ============================================
# 🖼️ Listar mídias para postar
# ============================================
@autopost_bp.route("/api/midias", methods=["GET"])
def listar_midias():
    """
    Query params:
      - tipo: banner | video | all (default: all)
      - limite: int (default: 20)
    """
    db = get_db()
    tipo = (request.args.get("tipo") or "all").lower()
    limite = int(request.args.get("limite") or 20)

    banners = videos = []
    if tipo in ("all", "banner"):
        banners = [b.to_dict() for b in db.query(BannerGerado).order_by(BannerGerado.id.desc()).limit(limite).all()]
    if tipo in ("all", "video"):
        videos = [v.to_dict() for v in db.query(VideoGerado).order_by(VideoGerado.id.desc()).limit(limite).all()]

    return jsonify({"ok": True, "banners": banners, "videos": videos})


# ============================================
# 📤 Postar agora (imagem/vídeo)
# ============================================
@autopost_bp.route("/api/postar", methods=["POST"])
def postar_agora():
    """
    JSON:
    {
      "rede": "instagram|youtube|kwai",
      "tipo": "banner|video",
      "id": 123,                        # id do BannerGerado ou VideoGerado
      "legenda": "opcional",
      "link": "opcional",
      "price": "opcional (ex.: R$ 199,90)"
    }
    """
    try:
        data = request.get_json() or {}
        rede = (data.get("rede") or "").lower()
        tipo = (data.get("tipo") or "").lower()
        midia_id = int(data.get("id") or 0)
        if not (rede and tipo and midia_id):
            return _json_error("Campos obrigatórios: rede, tipo, id")

        img_func, vid_func = _select_service(rede)
        if tipo == "banner" and not img_func:
            return _json_error(f"A rede '{rede}' não aceita imagens por API configurada ainda.")
        if tipo == "video" and not vid_func:
            return _json_error(f"A rede '{rede}' não aceita vídeos por API configurada ainda.")

        db = get_db()
        if tipo == "banner":
            item = db.query(BannerGerado).filter(BannerGerado.id == midia_id).first()
            if not item: return _json_error("Banner não encontrado", 404)
            legenda = data.get("legenda") or _cinematic_caption(item.titulo, item.preco_txt, data.get("link"))
            conta = _find_account(db, rede)
            resp = img_func(path=item.arquivo, caption=legenda, account=conta)
        else:
            item = db.query(VideoGerado).filter(VideoGerado.id == midia_id).first()
            if not item: return _json_error("Vídeo não encontrado", 404)
            legenda = data.get("legenda") or _cinematic_caption(item.titulo, data.get("price"), data.get("link"))
            conta = _find_account(db, rede)
            resp = vid_func(path=item.arquivo, caption=legenda, account=conta)

        if not resp or not resp.get("ok"):
            return _json_error(resp.get("error", "Falha ao publicar"))
        return jsonify({"ok": True, "post_url": resp.get("url")})
    except Exception as e:
        traceback.print_exc()
        return _json_error(str(e), 500)


# ============================================
# 🗓️ Agendar publicação
# ============================================
@autopost_bp.route("/api/agendar", methods=["POST"])
def agendar_post():
    """
    JSON:
    {
      "rede": "instagram|youtube|kwai",
      "tipo": "banner|video",
      "id": 123,
      "quando": "2025-11-05T10:30:00",   # ISO local
      "legenda": "opcional",
      "link": "opcional",
      "price": "opcional"
    }
    """
    if AutopostJob is None:
        return _json_error("Modelo de agendamento ainda não disponível. Crie business/autopost/models.py.")

    try:
        data = request.get_json() or {}
        for k in ("rede", "tipo", "id", "quando"):
            if not data.get(k):
                return _json_error(f"Campo obrigatório ausente: {k}")

        quando = datetime.fromisoformat(data["quando"])
        db = get_db()
        job = AutopostJob(
            platform=data["rede"].lower(),
            media_type=data["tipo"].lower(),
            media_id=int(data["id"]),
            caption=data.get("legenda"),
            link=data.get("link"),
            price=data.get("price"),
            run_at=quando
        )
        db.add(job)
        db.commit()
        return jsonify({"ok": True, "job_id": job.id})
    except Exception as e:
        traceback.print_exc()
        return _json_error(str(e), 500)


# ============================================
# 👤 Contas conectadas (listar/adicionar)
# ============================================
@autopost_bp.route("/api/contas", methods=["GET", "POST"])
def contas():
    """
    GET  -> lista contas
    POST -> cria/atualiza conta
    {
      "platform": "instagram|youtube|kwai",
      "access_token": "...",
      "extra": { ... }  # opcional (páginas, ids, etc.)
    }
    """
    if SocialAccount is None:
        return _json_error("Modelo SocialAccount ainda não disponível. Crie business/autopost/models.py.")

    db = get_db()
    if request.method == "GET":
        contas = db.query(SocialAccount).all()
        return jsonify([c.to_dict() for c in contas])

    data = request.get_json() or {}
    if not data.get("platform") or not data.get("access_token"):
        return _json_error("Campos obrigatórios: platform, access_token")

    # upsert por plataforma
    account = db.query(SocialAccount).filter(SocialAccount.platform == data["platform"].lower()).first()
    if not account:
        account = SocialAccount(platform=data["platform"].lower(), access_token=data["access_token"], extra=data.get("extra"))
        db.add(account)
    else:
        account.access_token = data["access_token"]
        account.extra = data.get("extra")
    db.commit()
    return jsonify({"ok": True})
