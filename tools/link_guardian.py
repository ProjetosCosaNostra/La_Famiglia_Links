
# ==========================================================
# Arquivo: tools/link_guardian.py
# Módulo : Link Guardian — Checa links e mantém vitrine operacional
# Versão : v10.0 (LINK POOL — monitora ate cinco links e faz failover seguro)
#
# Objetivo (prioridade de negócio):
#   1) NUNCA mais deixar a loja “zerada” por falso-positivo.
#   2) Evitar desativar produto por bloqueio/anti-bot/ruído.
#   3) Produto de vitrine precisa apontar para destino real de produto.
#      /social/, /lists, lista.* e account-verification com go inválido NÃO servem.
#   4) Alterar somente o link ativo quando houver fallback afiliado saudável.
#   5) Produto do Dia (featured) NUNCA automático.
#   6) Registrar relatório e saúde individual de cada link no catálogo:
#      - data/link_guardian_removed.json
#      - logs/link_guardian_removed.txt
#
# Regras:
#   - Se active_before == 0: restaura (bootstrap) e, se necessário, FORCE-RESTORE.
#   - 403/429/captcha/anti-bot => TEMP (não conta falha).
#   - 5xx/timeout => TEMP (não conta falha).
#   - 404/410 => HARD DEAD (pode desativar após FAIL_THRESHOLD).
#   - storefront invalid => entra no TXT/JSON de manutenção (sem desativar).
#   - “dead por conteúdo” (status 200) só se LG_DEAD_ON_BODY=1, mas apenas como diagnóstico.
# ==========================================================

from __future__ import annotations

import gzip
import json
import os
import re
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any, Dict, List, Tuple
from urllib.parse import parse_qs, unquote, urlparse

try:
    from tools.affiliate_links import choose_active_affiliate_url, normalize_affiliate_links
except ModuleNotFoundError:  # execucao direta: python tools/link_guardian.py
    from affiliate_links import choose_active_affiliate_url, normalize_affiliate_links


REPO_ROOT = Path(__file__).resolve().parents[1]
PRODUTOS_JSON = REPO_ROOT / "produtos.json"

DATA_DIR = REPO_ROOT / "data"
LOGS_DIR = REPO_ROOT / "logs"

REMOVED_JSON = Path(os.environ.get("LG_REMOVED_JSON_PATH", str(DATA_DIR / "link_guardian_removed.json")))
REMOVED_TXT = Path(os.environ.get("LG_REMOVED_TXT_PATH", str(LOGS_DIR / "link_guardian_removed.txt")))
REMOVED_MAX_EVENTS = int(os.environ.get("LG_REMOVED_MAX_EVENTS", "5000"))

REVIEW_JSON = Path(os.environ.get("LG_REVIEW_JSON_PATH", str(DATA_DIR / "link_guardian_review.json")))
REVIEW_TXT = Path(os.environ.get("LG_REVIEW_TXT_PATH", str(LOGS_DIR / "link_guardian_review.txt")))
REVIEW_MAX_ITEMS = int(os.environ.get("LG_REVIEW_MAX_ITEMS", "5000"))

MEMORY_JSON = Path(os.environ.get("LG_MEMORY_JSON_PATH", str(DATA_DIR / "link_guardian_memory.json")))


# =========================
# CONFIG (env)
# =========================
DEFAULT_TIMEOUT = float(os.environ.get("LG_TIMEOUT_SEC", "12"))
SLEEP_BETWEEN = float(os.environ.get("LG_SLEEP_SEC", "0.35"))

MAX_CHECK = int(os.environ.get("LG_MAX_CHECK", "60"))
MAX_CANDIDATE_URLS = int(os.environ.get("LG_MAX_CANDIDATE_URLS", "5"))

AUTO_REACTIVATE = os.environ.get("LG_AUTO_REACTIVATE", "1").strip() == "1"
CONSERVATIVE_ON_BLOCK = os.environ.get("LG_CONSERVATIVE_ON_BLOCK", "1").strip() == "1"

FAIL_THRESHOLD = int(os.environ.get("LG_FAIL_THRESHOLD", "3"))
STOREFRONT_INVALID_THRESHOLD = int(os.environ.get("LG_STOREFRONT_INVALID_THRESHOLD", "1"))

REMOVE_ON_DEAD = os.environ.get("LG_REMOVE_ON_DEAD", "0").strip() == "1"
TREAT_5XX_TEMP = os.environ.get("LG_TREAT_5XX_TEMP", "1").strip() == "1"

FAILSAFE_MIN_ACTIVE = int(os.environ.get("LG_FAILSAFE_MIN_ACTIVE", "10"))
FAILSAFE_MIN_RATIO = float(os.environ.get("LG_FAILSAFE_MIN_RATIO", "0.35"))

RECOVER_ON_TEMP = os.environ.get("LG_RECOVER_ON_TEMP", "1").strip() == "1"
RECOVER_MAX_DAYS = int(os.environ.get("LG_RECOVER_MAX_DAYS", "90"))

BOOTSTRAP_IF_ZERO = os.environ.get("LG_BOOTSTRAP_IF_ZERO", "1").strip() == "1"
BOOTSTRAP_MAX_DAYS = int(os.environ.get("LG_BOOTSTRAP_MAX_DAYS", "180"))

FORCE_RESTORE_ALL_IF_ZERO = os.environ.get("LG_FORCE_RESTORE_ALL_IF_ZERO", "1").strip() == "1"

SOCIAL_COUNTS_AS_OK = os.environ.get("LG_SOCIAL_COUNTS_AS_OK", "1").strip() == "1"
SOCIAL_INVALID_FOR_STOREFRONT = os.environ.get("LG_SOCIAL_INVALID_FOR_STOREFRONT", "1").strip() == "1"
LISTA_INVALID_FOR_STOREFRONT = os.environ.get("LG_LISTA_INVALID_FOR_STOREFRONT", "1").strip() == "1"

DEAD_ON_BODY = os.environ.get("LG_DEAD_ON_BODY", "0").strip() == "1"
STOREFRONT_REVIEW_ONLY = os.environ.get("LG_STOREFRONT_REVIEW_ONLY", "1").strip() == "1"
PURGE_REVIEW_ORPHANS = os.environ.get("LG_PURGE_REVIEW_ORPHANS", "1").strip() == "1"
PURGE_MEMORY_ORPHANS = os.environ.get("LG_PURGE_MEMORY_ORPHANS", "0").strip() == "1"


# =========================
# Mercado Livre host rules
# =========================
_ML_HOST_MARKERS = ("mercadolivre", "mercadolibre")
_ML_SHORT_HOSTS = {"meli.la", "meli.co"}

_LISTA_HOST_RE = re.compile(r"(^|\.)lista\.(mercadolivre|mercadolibre)\.[a-z.]+$", re.IGNORECASE)
_PRODUTO_HOST_RE = re.compile(r"(^|\.)produto\.(mercadolivre|mercadolibre)\.[a-z.]+$", re.IGNORECASE)


# =========================
# Heurística de indisponível (ML às vezes responde 200)
# (SÓ usado se DEAD_ON_BODY=1)
# =========================
_UNAVAILABLE_PATTERNS = [
    r"produto\s+indispon[ií]vel",
    r"an[uú]ncio\s+pausado",
    r"an[uú]ncio\s+(encerrado|finalizado|terminou)",
    r"publica[cç][aã]o\s+(encerrada|finalizada)",
    r"p[aá]gina\s+n[aã]o\s+encontrada",
    r"esta\s+p[aá]gina\s+n[aã]o\s+existe",
    r"n[aã]o\s+encontramos",
    r"error\s*404",
    r"no\s+est[aá]\s+disponible",
    r"ya\s+no\s+est[aá]\s+disponible",
    r"publicaci[oó]n\s+finalizada",
    r"no\s+hay\s+publicaciones",
]
_UNAVAILABLE_RE = re.compile("|".join(f"(?:{p})" for p in _UNAVAILABLE_PATTERNS), re.IGNORECASE)

_BLOCK_PAGE_PATTERNS = [
    r"captcha",
    r"recaptcha",
    r"cloudflare",
    r"attention\s+required",
    r"access\s+denied",
    r"unusual\s+traffic",
    r"verify\s+you\s+are\s+human",
    r"are\s+you\s+a\s+robot",
    r"tr[aá]fego\s+incomum",
    r"verifique\s+se\s+voc[eê]\s+é\s+humano",
]
_BLOCK_PAGE_RE = re.compile("|".join(f"(?:{p})" for p in _BLOCK_PAGE_PATTERNS), re.IGNORECASE)

_HARD_DEAD_STATUS = {404, 410}
_BLOCK_STATUS = {403, 429}
_TEMP_STATUS = {408, 425, 500, 502, 503, 504}


# =========================
# Data structures
# =========================
@dataclass
class CheckResult:
    ok: bool
    temporary: bool
    status: int
    final_url: str
    reason: str
    hard_dead: bool
    checked_url: str
    storefront_invalid: bool
    promoted_url: str = ""



def _guardian_confidence_bucket(score: int) -> str:
    if score >= 95:
        return "confirmado"
    if score >= 70:
        return "forte_evidencia"
    if score >= 40:
        return "revisar_manual"
    return "invalido"


def _guardian_reason_bucket(res: CheckResult) -> str:
    reason = (res.reason or "").strip().lower()
    checked = _clean_url(res.checked_url or "")
    final_url = _clean_url(res.final_url or "")
    unwrapped_checked = bool(_unwrap_account_verification(checked))

    if reason == "storefront_social_lists_invalid":
        return "storefront_social_lists_invalid"
    if reason == "storefront_listing_invalid":
        return "listing_search_fallback"
    if reason == "storefront_social_profile_unconfirmed":
        return "storefront_profile_unconfirmed"
    if reason == "social_profile_needs_review":
        return "storefront_profile_needs_review"
    if reason == "social_profile_product_confirmed":
        return "storefront_profile_confirmed"
    if reason == "social_profile_ok":
        return "storefront_profile_raw"
    if reason == "ok_unwrapped":
        return "account_verification_wrapped_valid" if unwrapped_checked else "product_direct_valid"
    if reason == "ok":
        if unwrapped_checked:
            return "account_verification_wrapped_valid"
        if _looks_like_product_destination(final_url):
            return "product_direct_valid"
        return "generic_ok"
    if reason == "dead":
        return "hard_dead" if res.hard_dead else "dead_unconfirmed"
    if reason == "nao_ml":
        return "outside_mercado_livre"
    if reason == "sem_url":
        return "missing_url"
    if reason == "sem_resposta":
        return "temporary_no_response"
    if reason == "bloqueio":
        return "temporary_block"
    if reason == "social_temp":
        return "temporary_social_profile"
    if reason.startswith("temp_"):
        return "temporary_server_or_timeout"
    return "review_misc"


def _guardian_confidence_score(p: Dict[str, Any], res: CheckResult) -> int:
    reason = (res.reason or "").strip().lower()
    score = 50

    if res.ok:
        if reason in {"ok", "ok_unwrapped"}:
            score = 97 if _looks_like_product_destination(res.final_url) else 92
        elif reason == "social_profile_product_confirmed":
            score = 82
        elif reason == "social_profile_ok":
            score = 68
        else:
            score = 85
    elif res.temporary:
        if reason == "bloqueio":
            score = 56
        elif reason == "sem_resposta":
            score = 48
        elif reason == "social_temp":
            score = 52
        elif reason.startswith("temp_"):
            score = 45
        else:
            score = 42
    elif res.storefront_invalid:
        if reason == "storefront_social_lists_invalid":
            score = 18
        elif reason == "storefront_listing_invalid":
            score = 24
        elif reason == "storefront_social_profile_unconfirmed":
            score = 34
        elif reason == "social_profile_needs_review":
            score = 55
        else:
            score = 30
    elif reason == "dead":
        score = 5 if res.hard_dead else 12
    elif reason == "nao_ml":
        score = 8
    elif reason == "sem_url":
        score = 3

    score += min(4, len([x for x in (p.get("badges") or []) if str(x).strip()]))
    score += min(3, len([x for x in (p.get("smart_categories") or p.get("categories") or []) if str(x).strip()]))
    if p.get("issue_number"):
        score += 1
    if p.get("featured"):
        score += 1

    return max(0, min(100, int(score)))


def _guardian_reason_bucket_label(bucket: str) -> str:
    labels = {
        "storefront_social_lists_invalid": "storefront social /lists inválido",
        "listing_search_fallback": "fallback para lista/busca",
        "storefront_profile_unconfirmed": "perfil social sem confirmação",
        "storefront_profile_needs_review": "perfil social com revisão manual",
        "storefront_profile_confirmed": "perfil social confirmado por evidência",
        "storefront_profile_raw": "perfil social bruto",
        "account_verification_wrapped_valid": "account-verification com destino válido",
        "product_direct_valid": "produto direto válido",
        "generic_ok": "OK genérico",
        "hard_dead": "morto confirmado",
        "dead_unconfirmed": "morto provável",
        "outside_mercado_livre": "fora do Mercado Livre",
        "missing_url": "sem URL",
        "temporary_no_response": "temporário sem resposta",
        "temporary_block": "temporário por bloqueio/anti-bot",
        "temporary_social_profile": "temporário em perfil social",
        "temporary_server_or_timeout": "temporário servidor/timeout",
        "review_misc": "revisão manual diversa",
    }
    return labels.get((bucket or "").strip(), (bucket or "").strip() or "revisão manual diversa")


# =========================
# UTILS
# =========================
def _utc_now_iso_z() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _iso_to_dt(s: str) -> datetime | None:
    if not s:
        return None
    x = str(s).strip()
    try:
        if x.endswith("Z"):
            x = x[:-1] + "+00:00"
        return datetime.fromisoformat(x)
    except Exception:
        return None


def _recent_enough(last_ok: str, max_days: int) -> bool:
    dt = _iso_to_dt(last_ok or "")
    if not dt:
        return False
    now = datetime.now(timezone.utc)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt >= (now - timedelta(days=max_days))


def _read_json(path: Path) -> Dict[str, Any]:
    if not path.exists():
        return {"updated_at": _utc_now_iso_z(), "products": []}
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def _write_json(path: Path, data: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")


def _write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        f.write(text)


def _clean_url(u: str) -> str:
    if not u:
        return ""
    x = str(u).strip()
    while x and x[0] in {"'", '"', " "}:
        x = x[1:]
    junk = {'"', "'", ")", "]", ">", "\\", " ", "\t", "\r", "\n"}
    while x and x[-1] in junk:
        x = x[:-1]
    return x.strip()


def _normalize_text(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip().lower())


def _tokenize_product_text(s: str) -> List[str]:
    base = _normalize_text(s)
    toks = re.findall(r"[a-z0-9]{3,}", base)
    stop = {
        "para", "com", "sem", "uma", "das", "dos", "and", "the", "usb", "preto",
        "premium", "produto", "portatil", "carregador", "power", "bank", "plus",
        "mini", "pro", "novo", "nova", "mais"
    }
    seen = set()
    out: List[str] = []
    for tok in sorted(toks, key=len, reverse=True):
        if tok in stop:
            continue
        if tok in seen:
            continue
        seen.add(tok)
        out.append(tok)
        if len(out) >= 8:
            break
    return out


def _product_evidence_score(p: Dict[str, Any], body_sample: str, final_url: str) -> Tuple[int, List[str]]:
    score = 0
    reasons: List[str] = []
    hay = _normalize_text(body_sample)
    final = _normalize_text(final_url)

    id_busca = _normalize_text(str(p.get("id_busca") or ""))
    if id_busca:
        if id_busca in hay:
            score += 8
            reasons.append("id_busca_body")
        if id_busca in final:
            score += 6
            reasons.append("id_busca_url")

    title = str(p.get("title") or "")
    for tok in _tokenize_product_text(title):
        if tok in hay:
            score += 2
            reasons.append(f"title:{tok}")
        elif tok in final:
            score += 1
            reasons.append(f"url:{tok}")

    sku = _normalize_text(str(p.get("sku") or ""))
    if sku:
        for tok in _tokenize_product_text(sku.replace("-", " ")):
            if tok in hay:
                score += 1
                reasons.append(f"sku:{tok}")

    for badge in (p.get("badges") or [])[:6]:
        badge_norm = _normalize_text(str(badge or ""))
        if badge_norm and badge_norm in hay:
            score += 1
            reasons.append(f"badge:{badge_norm}")

    if "ir para produto" in hay or "ver produto" in hay or "comprar" in hay:
        score += 2
        reasons.append("cta_produto")

    return score, reasons


def _evaluate_storefront_open_url(p: Dict[str, Any]) -> CheckResult | None:
    storefront = _clean_url(p.get("open_url") or "")
    if not storefront:
        return None

    res = _check_url(storefront)

    # Open_url real do card manda primeiro.
    if res.reason in {"storefront_social_lists_invalid", "storefront_listing_invalid"}:
        return res

    # Produto direto sempre OK.
    if res.ok and _looks_like_product_destination(res.final_url):
        return res

    # Perfil social só vale como OK se houver evidência do produto.
    if _is_social_profile_path(res.final_url):
        score, evidence = _product_evidence_score(p, _fetch_status_and_sample(storefront)[2] if res.reason == "social_profile_ok" else "", res.final_url)
        if SOCIAL_COUNTS_AS_OK and score >= 8:
            return CheckResult(
                ok=True,
                temporary=False,
                status=res.status,
                final_url=res.final_url,
                reason="social_profile_product_confirmed",
                hard_dead=False,
                checked_url=res.checked_url,
                storefront_invalid=False,
                promoted_url="",
            )
        if score >= 4:
            return CheckResult(
                ok=False,
                temporary=False,
                status=res.status,
                final_url=res.final_url,
                reason="social_profile_needs_review",
                hard_dead=False,
                checked_url=res.checked_url,
                storefront_invalid=True,
                promoted_url="",
            )
        return CheckResult(
            ok=False,
            temporary=False,
            status=res.status,
            final_url=res.final_url,
            reason="storefront_social_profile_unconfirmed",
            hard_dead=False,
            checked_url=res.checked_url,
            storefront_invalid=True,
            promoted_url="",
        )

    return res


def _host_of(u: str) -> str:
    try:
        pu = urlparse(u or "")
        host = (pu.netloc or "").strip().lower()
        if "@" in host:
            host = host.split("@", 1)[-1]
        if ":" in host:
            host = host.split(":", 1)[0]
        if host.startswith("www."):
            host = host[4:]
        return host
    except Exception:
        return ""


def _path_of(u: str) -> str:
    try:
        pu = urlparse(u or "")
        return (pu.path or "").strip().lower()
    except Exception:
        return ""


def _query_of(u: str) -> Dict[str, List[str]]:
    try:
        return parse_qs(urlparse(u or "").query or "", keep_blank_values=True)
    except Exception:
        return {}


def _is_social_path(u: str) -> bool:
    pth = _path_of(u)
    if not pth:
        return False
    return "/social/" in pth

def _is_social_lists_path(u: str) -> bool:
    pth = _path_of(u)
    if not pth:
        return False
    return ("/social/" in pth) and pth.endswith("/lists")

def _is_social_profile_path(u: str) -> bool:
    pth = _path_of(u)
    if not pth:
        return False
    return ("/social/" in pth) and (not pth.endswith("/lists"))


def _is_lista_url(u: str) -> bool:
    host = _host_of(u)
    if not host:
        return False
    return bool(_LISTA_HOST_RE.search(host))


def _is_ml_url(u: str) -> bool:
    if not u:
        return False
    x = _clean_url(u).lower()
    host = _host_of(x)
    if not host:
        return False

    if host in _ML_SHORT_HOSTS:
        return True

    if re.fullmatch(r"meli\.[a-z]{2,6}", host or ""):
        return True

    for marker in _ML_HOST_MARKERS:
        if marker in host:
            return True

    return False


def _looks_like_product_destination(u: str) -> bool:
    if not _is_ml_url(u):
        return False

    host = _host_of(u)
    path = _path_of(u)
    full = (u or "").lower()

    if _PRODUTO_HOST_RE.search(host):
        return True

    if re.search(r"/mlb[-_/]", full, re.IGNORECASE):
        return True

    if re.search(r"/p/mlb", full, re.IGNORECASE):
        return True

    if re.search(r"/p/[a-z]{2,4}\d+", full, re.IGNORECASE):
        return True

    if "/item" in path and "mlb" in full:
        return True

    return False


def _unwrap_account_verification(u: str) -> str:
    try:
        pu = urlparse(u or "")
        host = _host_of(u)
        path = (pu.path or "").strip().lower()

        if "mercadolivre" not in host and "mercadolibre" not in host:
            return ""

        if path != "/gz/account-verification":
            return ""

        qs = parse_qs(pu.query or "", keep_blank_values=True)
        go = (qs.get("go") or [""])[0]
        go = unquote(go or "")
        return _clean_url(go)
    except Exception:
        return ""


def _looks_corrupt_product(p: Dict[str, Any]) -> bool:
    sku = (p.get("sku") or "").strip()
    if not sku:
        return True

    s = sku.lower()
    if s.startswith("<") or "<img" in s or "</" in s:
        return True
    if "http://" in s or "https://" in s:
        return True
    if len(sku) > 160:
        return True

    open_url = (p.get("open_url") or "").strip().lower()
    if open_url and "github.com/user-attachments" in open_url:
        return True

    return False


def _candidate_urls(p: Dict[str, Any]) -> List[str]:
    raw_candidates = [
        _clean_url(p.get("canonical_url") or ""),
        _clean_url(p.get("resolved_url") or ""),
        _clean_url(p.get("short_url") or ""),
        _clean_url(p.get("check_url") or ""),
        _clean_url(p.get("open_url") or ""),
    ]

    out: List[str] = []
    seen = set()

    for url in raw_candidates:
        if not url:
            continue
        if url in seen:
            continue
        seen.add(url)
        out.append(url)
        if MAX_CANDIDATE_URLS > 0 and len(out) >= MAX_CANDIDATE_URLS:
            break

    return out


def _make_request(url: str) -> urllib.request.Request:
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/125.0.0.0 Safari/537.36"
        ),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.6,es;q=0.5",
        "Accept-Encoding": "gzip",
        "Connection": "close",
        "Range": "bytes=0-65535",
    }
    return urllib.request.Request(url, headers=headers, method="GET")


def _decode_body(raw: bytes, is_gzip: bool) -> str:
    if not raw:
        return ""
    try:
        if is_gzip:
            raw = gzip.decompress(raw)
    except Exception:
        pass

    try:
        return raw.decode("utf-8", errors="ignore")
    except Exception:
        try:
            return raw.decode("latin-1", errors="ignore")
        except Exception:
            return ""


def _fetch_status_and_sample(url: str) -> Tuple[int, str, str]:
    req = _make_request(url)

    try:
        with urllib.request.urlopen(req, timeout=DEFAULT_TIMEOUT) as resp:
            status = int(getattr(resp, "status", 200) or 200)
            final_url = _clean_url(resp.geturl() or url)

            raw = resp.read() or b""
            enc = (resp.headers.get("Content-Encoding") or "").lower()
            sample = _decode_body(raw, is_gzip=(enc == "gzip"))
            return status, final_url, sample

    except urllib.error.HTTPError as e:
        status = int(getattr(e, "code", 0) or 0)
        final_url = _clean_url(getattr(e, "url", "") or url)
        try:
            raw = e.read() or b""
            sample = _decode_body(raw, is_gzip=False)
        except Exception:
            sample = ""
        return status, final_url, sample

    except urllib.error.URLError:
        return 0, url, ""


def _is_block_page(status: int, final_url: str, body_sample: str) -> bool:
    if status in _BLOCK_STATUS:
        return True

    text = (body_sample or "").lower()
    if text and _BLOCK_PAGE_RE.search(text):
        return True

    return False


def _is_definitely_dead(status: int, final_url: str, body_sample: str) -> bool:
    if status in _HARD_DEAD_STATUS:
        return True

    if not DEAD_ON_BODY:
        return False

    text = (body_sample or "").lower()
    if not text:
        return False

    if _BLOCK_PAGE_RE.search(text):
        return False

    if _is_social_path(final_url):
        return False

    if _is_lista_url(final_url):
        return False

    if _UNAVAILABLE_RE.search(text):
        return True

    return False


def _check_url(url: str) -> CheckResult:
    u = _clean_url(url)

    if not u:
        return CheckResult(
            ok=False,
            temporary=False,
            status=0,
            final_url="",
            reason="sem_url",
            hard_dead=False,
            checked_url=u,
            storefront_invalid=False,
            promoted_url="",
        )

    if not _is_ml_url(u):
        return CheckResult(
            ok=False,
            temporary=False,
            status=0,
            final_url=u,
            reason="nao_ml",
            hard_dead=False,
            checked_url=u,
            storefront_invalid=False,
            promoted_url="",
        )

    status, final_url, sample = _fetch_status_and_sample(u)
    final_url = _clean_url(final_url or u)

    if status == 0:
        return CheckResult(
            ok=False,
            temporary=True,
            status=0,
            final_url=final_url or u,
            reason="sem_resposta",
            hard_dead=False,
            checked_url=u,
            storefront_invalid=False,
            promoted_url="",
        )

    if CONSERVATIVE_ON_BLOCK and _is_block_page(status, final_url, sample):
        return CheckResult(
            ok=False,
            temporary=True,
            status=status,
            final_url=final_url or u,
            reason="bloqueio",
            hard_dead=False,
            checked_url=u,
            storefront_invalid=False,
            promoted_url="",
        )

    unwrapped = _unwrap_account_verification(final_url)
    if unwrapped:
        if _is_social_lists_path(unwrapped):
            return CheckResult(
                ok=False,
                temporary=False,
                status=status,
                final_url=unwrapped,
                reason="storefront_social_lists_invalid",
                hard_dead=False,
                checked_url=u,
                storefront_invalid=True,
                promoted_url="",
            )

        if LISTA_INVALID_FOR_STOREFRONT and _is_lista_url(unwrapped):
            return CheckResult(
                ok=False,
                temporary=False,
                status=status,
                final_url=unwrapped,
                reason="storefront_listing_invalid",
                hard_dead=False,
                checked_url=u,
                storefront_invalid=True,
                promoted_url="",
            )

        if _looks_like_product_destination(unwrapped):
            return CheckResult(
                ok=True,
                temporary=False,
                status=status,
                final_url=unwrapped,
                reason="ok_unwrapped",
                hard_dead=False,
                checked_url=u,
                storefront_invalid=False,
                promoted_url=unwrapped,
            )

        if _is_social_profile_path(unwrapped) and status == 200:
            return CheckResult(
                ok=bool(SOCIAL_COUNTS_AS_OK),
                temporary=not bool(SOCIAL_COUNTS_AS_OK),
                status=status,
                final_url=unwrapped,
                reason="social_profile_ok",
                hard_dead=False,
                checked_url=u,
                storefront_invalid=False,
                promoted_url="",
            )

    if _is_social_lists_path(final_url):
        return CheckResult(
            ok=False,
            temporary=False,
            status=status,
            final_url=final_url or u,
            reason="storefront_social_lists_invalid",
            hard_dead=False,
            checked_url=u,
            storefront_invalid=True,
            promoted_url="",
        )

    if _is_social_profile_path(final_url):
        if status == 200:
            return CheckResult(
                ok=bool(SOCIAL_COUNTS_AS_OK),
                temporary=not bool(SOCIAL_COUNTS_AS_OK),
                status=status,
                final_url=final_url or u,
                reason="social_profile_ok",
                hard_dead=False,
                checked_url=u,
                storefront_invalid=False,
                promoted_url="",
            )

        return CheckResult(
            ok=False,
            temporary=True,
            status=status,
            final_url=final_url or u,
            reason="social_temp",
            hard_dead=False,
            checked_url=u,
            storefront_invalid=False,
            promoted_url="",
        )

    if LISTA_INVALID_FOR_STOREFRONT and _is_lista_url(final_url):
        return CheckResult(
            ok=False,
            temporary=False,
            status=status,
            final_url=final_url or u,
            reason="storefront_listing_invalid",
            hard_dead=False,
            checked_url=u,
            storefront_invalid=True,
            promoted_url="",
        )

    if TREAT_5XX_TEMP and status in _TEMP_STATUS:
        return CheckResult(
            ok=False,
            temporary=True,
            status=status,
            final_url=final_url or u,
            reason=f"temp_{status}",
            hard_dead=False,
            checked_url=u,
            storefront_invalid=False,
            promoted_url="",
        )

    if _is_definitely_dead(status, final_url, sample):
        hard = status in _HARD_DEAD_STATUS
        return CheckResult(
            ok=False,
            temporary=False,
            status=status,
            final_url=final_url or u,
            reason="dead",
            hard_dead=hard,
            checked_url=u,
            storefront_invalid=False,
            promoted_url="",
        )

    return CheckResult(
        ok=True,
        temporary=False,
        status=status,
        final_url=final_url or u,
        reason="ok",
        hard_dead=False,
        checked_url=u,
        storefront_invalid=False,
        promoted_url="",
    )


def _check_product_urls(p: Dict[str, Any]) -> CheckResult:
    candidates = _candidate_urls(p)

    if not candidates:
        return CheckResult(
            ok=False,
            temporary=False,
            status=0,
            final_url="",
            reason="sem_url",
            hard_dead=False,
            checked_url="",
            storefront_invalid=False,
            promoted_url="",
        )

    # 1) Primeiro julga o link real do card/storefront.
    storefront_res = _evaluate_storefront_open_url(p)
    if storefront_res is not None:
        if storefront_res.reason in {
            "storefront_social_lists_invalid",
            "storefront_listing_invalid",
            "storefront_social_profile_unconfirmed",
            "social_profile_needs_review",
        }:
            return storefront_res
        if storefront_res.ok and storefront_res.reason in {
            "ok", "ok_unwrapped", "social_profile_product_confirmed"
        }:
            return storefront_res

    first_result: CheckResult | None = storefront_res
    social_invalid_result: CheckResult | None = None
    listing_invalid_result: CheckResult | None = None
    dead_result: CheckResult | None = None
    temp_result: CheckResult | None = None
    generic_result: CheckResult | None = None

    open_url_clean = _clean_url(p.get("open_url") or "")

    for url in candidates:
        if open_url_clean and _clean_url(url) == open_url_clean:
            continue

        res = _check_url(url)

        if first_result is None:
            first_result = res

        # Social profile genérico não basta para "OK" fora do open_url.
        if res.ok and not res.storefront_invalid and res.reason != "social_profile_ok":
            return res

        if res.reason == "storefront_social_lists_invalid" and social_invalid_result is None:
            social_invalid_result = res
            continue

        if res.reason == "storefront_listing_invalid" and listing_invalid_result is None:
            listing_invalid_result = res
            continue

        if res.hard_dead and dead_result is None:
            dead_result = res
            continue

        if res.reason == "dead" and dead_result is None:
            dead_result = res
            continue

        if res.temporary and temp_result is None:
            temp_result = res
            continue

        if generic_result is None:
            generic_result = res

    if social_invalid_result is not None:
        return social_invalid_result

    if listing_invalid_result is not None:
        return listing_invalid_result

    if dead_result is not None:
        return dead_result

    if temp_result is not None:
        return temp_result

    if generic_result is not None:
        return generic_result

    return first_result or CheckResult(
        ok=False,
        temporary=False,
        status=0,
        final_url="",
        reason="sem_url",
        hard_dead=False,
        checked_url="",
        storefront_invalid=False,
        promoted_url="",
    )


def _check_affiliate_pool(p: Dict[str, Any], happened_at: str) -> CheckResult | None:
    """Valida ate cinco links e troca o principal sem perder o rastreio afiliado."""

    entries = normalize_affiliate_links(p)
    if not entries:
        return None

    current = _clean_url(p.get("active_affiliate_url") or p.get("open_url") or "")
    results_by_url: Dict[str, CheckResult] = {}

    for entry in entries:
        url = _clean_url(entry.get("url") or "")
        res = _check_url(url)
        results_by_url[url] = res

        entry["last_checked"] = happened_at
        entry["last_status"] = int(res.status or 0)
        entry["last_final_url"] = _clean_url(res.final_url or "")
        entry["last_reason"] = str(res.reason or "")

        if res.ok:
            entry["status"] = "healthy"
            entry["fail_count"] = 0
            entry["last_ok"] = happened_at
        elif res.temporary:
            entry["status"] = "temporary"
        else:
            fails = int(entry.get("fail_count") or 0) + 1
            entry["fail_count"] = fails
            entry["status"] = "dead" if (res.hard_dead and fails >= FAIL_THRESHOLD) else "suspect"

        time.sleep(SLEEP_BETWEEN)

    selected = choose_active_affiliate_url(entries, current)
    if selected and selected != current:
        p["affiliate_failover_at"] = happened_at
        p["affiliate_previous_url"] = current

    p["affiliate_links"] = entries
    p["active_affiliate_url"] = selected
    p["affiliate_healthy_count"] = sum(1 for entry in entries if entry.get("status") == "healthy")
    p["affiliate_links_exhausted"] = bool(entries) and all(entry.get("status") == "dead" for entry in entries)
    if selected:
        p["open_url"] = selected

    if selected in results_by_url:
        return results_by_url[selected]

    return next(iter(results_by_url.values()), None)

def _sort_key(p: Dict[str, Any]) -> Tuple[int, int]:
    return (0 if bool(p.get("active")) else 1, 0 if bool(p.get("featured")) else 1)


def _clear_dead_markers(p: Dict[str, Any]) -> None:
    for k in (
        "guardian_dead_status",
        "guardian_dead_reason",
        "guardian_disabled_at",
        "guardian_storefront_invalid",
    ):
        if k in p:
            try:
                del p[k]
            except Exception:
                pass


def _promote_valid_url(p: Dict[str, Any], good_url: str) -> int:
    good = _clean_url(good_url)
    if not good:
        return 0

    changed = 0

    if _clean_url(p.get("check_url") or "") != good:
        p["check_url"] = good
        changed += 1

    open_url = _clean_url(p.get("open_url") or "")
    if not open_url or _is_social_path(open_url) or _is_lista_url(open_url) or _unwrap_account_verification(open_url):
        if open_url != good:
            p["open_url"] = good
            changed += 1

    if _clean_url(p.get("resolved_url") or "") != good:
        p["resolved_url"] = good
        changed += 1

    canonical = _clean_url(p.get("canonical_url") or "")
    if not canonical or _is_social_path(canonical) or _is_lista_url(canonical):
        if canonical != good:
            p["canonical_url"] = good
            changed += 1

    return changed


def _force_restore_all(products: List[Dict[str, Any]]) -> int:
    boosted = 0
    for p in products:
        if not isinstance(p, dict):
            continue

        sku = (p.get("sku") or "").strip()
        if not sku:
            continue

        if not bool(p.get("active")):
            p["active"] = True
            p["guardian_fail_count"] = 0
            _clear_dead_markers(p)
            boosted += 1
        else:
            if int(p.get("guardian_fail_count") or 0) != 0:
                p["guardian_fail_count"] = 0

    return boosted


# =========================
# MEMÓRIA OPERACIONAL
# =========================
def _load_guardian_memory(path: Path) -> Dict[str, Any]:
    base = {
        "updated_at": "",
        "summary": {
            "tracked_skus": 0,
            "confirmed_good_links": 0,
            "recurrent_storefront_invalid": 0,
            "relink_priority": 0,
        },
        "skus": {},
    }
    if not path.exists():
        return base
    try:
        with path.open("r", encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, dict):
            return base
        if not isinstance(data.get("skus"), dict):
            data["skus"] = {}
        if not isinstance(data.get("summary"), dict):
            data["summary"] = base["summary"].copy()
        if "updated_at" not in data:
            data["updated_at"] = ""
        return data
    except Exception:
        return base


def _refresh_guardian_memory_meta(memory: Dict[str, Any]) -> None:
    skus = memory.get("skus") or {}
    if not isinstance(skus, dict):
        skus = {}
    tracked_skus = 0
    confirmed_good_links = 0
    recurrent_storefront_invalid = 0
    relink_priority = 0
    for sku, item in skus.items():
        if not sku or not isinstance(item, dict):
            continue
        tracked_skus += 1
        if str(item.get("guardian_last_good_confirmed_at") or "").strip():
            confirmed_good_links += 1
        reason_counts = item.get("reason_counts") or {}
        if int(reason_counts.get("storefront_social_lists_invalid") or 0) >= 2:
            recurrent_storefront_invalid += 1
        if bool(item.get("relink_priority")):
            relink_priority += 1
    memory["summary"] = {
        "tracked_skus": tracked_skus,
        "confirmed_good_links": confirmed_good_links,
        "recurrent_storefront_invalid": recurrent_storefront_invalid,
        "relink_priority": relink_priority,
    }
    memory["updated_at"] = _utc_now_iso_z()


def _save_guardian_memory(memory: Dict[str, Any]) -> None:
    _refresh_guardian_memory_meta(memory)
    _write_json(MEMORY_JSON, memory)


def _get_or_create_memory_item(memory: Dict[str, Any], sku: str) -> Dict[str, Any]:
    skus = memory.setdefault("skus", {})
    if not isinstance(skus, dict):
        memory["skus"] = {}
        skus = memory["skus"]
    sku = str(sku or "").strip()
    item = skus.get(sku)
    if not isinstance(item, dict):
        item = {
            "reason_counts": {},
            "first_seen_at": "",
            "last_seen_at": "",
            "guardian_last_good_open_url": "",
            "guardian_last_good_check_url": "",
            "guardian_last_good_confirmed_at": "",
            "relink_priority": False,
            "last_reason": "",
            "last_final_url": "",
        }
        skus[sku] = item
    return item


def _record_memory_observation(memory_item: Dict[str, Any], p: Dict[str, Any], res: CheckResult, happened_at: str) -> None:
    reason = str(res.reason or "").strip()
    reason_counts = memory_item.setdefault("reason_counts", {})
    if not isinstance(reason_counts, dict):
        reason_counts = {}
        memory_item["reason_counts"] = reason_counts
    if reason:
        reason_counts[reason] = int(reason_counts.get(reason) or 0) + 1
    if not str(memory_item.get("first_seen_at") or "").strip():
        memory_item["first_seen_at"] = happened_at
    memory_item["last_seen_at"] = happened_at
    memory_item["last_reason"] = reason
    memory_item["last_final_url"] = _clean_url(res.final_url or "")

    if res.ok and _looks_like_product_destination(res.final_url):
        open_url_good = _clean_url(p.get("open_url") or res.final_url or "")
        check_url_good = _clean_url(p.get("check_url") or res.checked_url or res.final_url or "")
        memory_item["guardian_last_good_open_url"] = open_url_good
        memory_item["guardian_last_good_check_url"] = check_url_good
        memory_item["guardian_last_good_confirmed_at"] = happened_at

    reason_counts = memory_item.get("reason_counts") or {}
    memory_item["relink_priority"] = bool(
        int(reason_counts.get("storefront_social_lists_invalid") or 0) >= 3
        and str(memory_item.get("guardian_last_good_confirmed_at") or "").strip()
    )


def _apply_last_good_fields_from_memory(p: Dict[str, Any], memory_item: Dict[str, Any]) -> None:
    open_url = _clean_url(memory_item.get("guardian_last_good_open_url") or "")
    check_url = _clean_url(memory_item.get("guardian_last_good_check_url") or "")
    confirmed_at = str(memory_item.get("guardian_last_good_confirmed_at") or "").strip()
    if open_url:
        p["guardian_last_good_open_url"] = open_url
    if check_url:
        p["guardian_last_good_check_url"] = check_url
    if confirmed_at:
        p["guardian_last_good_confirmed_at"] = confirmed_at


def _memory_note_from_item(memory_item: Dict[str, Any]) -> str:
    if not isinstance(memory_item, dict) or not memory_item:
        return ""
    reason_counts = memory_item.get("reason_counts") or {}
    lists_count = int(reason_counts.get("storefront_social_lists_invalid") or 0)
    listing_count = int(reason_counts.get("storefront_listing_invalid") or 0)
    good_at = str(memory_item.get("guardian_last_good_confirmed_at") or "").strip()
    if bool(memory_item.get("relink_priority")):
        return f"relink prioritário: padrão recorrente ({lists_count}x /lists, {listing_count}x listing) com último link bom confirmado em {good_at}"
    if good_at and (lists_count or listing_count):
        return f"histórico recorrente ({lists_count}x /lists, {listing_count}x listing), mas já houve link bom confirmado em {good_at}"
    if lists_count or listing_count:
        return f"histórico recorrente ({lists_count}x /lists, {listing_count}x listing)"
    return ""


# =========================
# RELATÓRIO DE REMOVIDOS
# =========================
def _load_removed_history(path: Path) -> Dict[str, Any]:
    if not path.exists():
        return {
            "updated_at": "",
            "total_events": 0,
            "weekly_summary": [],
            "events": [],
        }

    try:
        with path.open("r", encoding="utf-8") as f:
            data = json.load(f)

        if not isinstance(data, dict):
            raise ValueError("json inválido")

        if not isinstance(data.get("events"), list):
            data["events"] = []

        if not isinstance(data.get("weekly_summary"), list):
            data["weekly_summary"] = []

        if "updated_at" not in data:
            data["updated_at"] = ""

        if "total_events" not in data:
            data["total_events"] = len(data["events"])

        return data
    except Exception:
        return {
            "updated_at": "",
            "total_events": 0,
            "weekly_summary": [],
            "events": [],
        }


def _week_key_from_iso(iso_value: str) -> str:
    dt = _iso_to_dt(iso_value or "") or datetime.now(timezone.utc)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    iso = dt.isocalendar()
    return f"{iso.year}-W{iso.week:02d}"


def _build_removed_event(
    p: Dict[str, Any],
    res: CheckResult,
    happened_at: str,
    event_type: str,
    fail_count: int,
    fail_threshold: int,
    was_active: bool,
    was_featured: bool,
) -> Dict[str, Any]:
    return {
        "event_type": event_type,
        "week_key": _week_key_from_iso(happened_at),
        "happened_at": happened_at,
        "sku": (p.get("sku") or "").strip(),
        "title": (p.get("title") or "").strip(),
        "id_busca": (p.get("id_busca") or "").strip(),
        "status": int(res.status),
        "reason": res.reason,
        "hard_dead": bool(res.hard_dead),
        "storefront_invalid": bool(res.storefront_invalid),
        "fail_count": int(fail_count),
        "fail_threshold": int(fail_threshold),
        "was_active": bool(was_active),
        "was_featured": bool(was_featured),
        "checked_url": _clean_url(res.checked_url or ""),
        "open_url": _clean_url(p.get("open_url") or ""),
        "check_url": _clean_url(p.get("check_url") or ""),
        "canonical_url": _clean_url(p.get("canonical_url") or ""),
        "short_url": _clean_url(p.get("short_url") or ""),
        "resolved_url": _clean_url(p.get("resolved_url") or ""),
        "final_url": _clean_url(res.final_url or ""),
        "guardian_last_reason": (p.get("guardian_last_reason") or "").strip(),
        "guardian_last_status": int(p.get("guardian_last_status") or 0),
    }


def _event_fingerprint(ev: Dict[str, Any]) -> str:
    return "|".join([
        str(ev.get("event_type") or ""),
        str(ev.get("week_key") or ""),
        str(ev.get("sku") or ""),
        str(ev.get("status") or ""),
        str(ev.get("reason") or ""),
        str(ev.get("checked_url") or ""),
        str(ev.get("final_url") or ""),
    ])


def _refresh_removed_history_meta(history: Dict[str, Any]) -> None:
    events = history.get("events") or []
    if not isinstance(events, list):
        events = []

    buckets: Dict[str, Dict[str, Any]] = {}

    for ev in events:
        if not isinstance(ev, dict):
            continue

        wk = str(ev.get("week_key") or "").strip() or _week_key_from_iso(ev.get("happened_at") or "")
        if wk not in buckets:
            buckets[wk] = {
                "week_key": wk,
                "events": 0,
                "unique_skus": set(),
            }

        buckets[wk]["events"] += 1
        sku = str(ev.get("sku") or "").strip()
        if sku:
            buckets[wk]["unique_skus"].add(sku)

    weekly_summary = []
    for wk in sorted(buckets.keys(), reverse=True):
        row = buckets[wk]
        weekly_summary.append({
            "week_key": wk,
            "events": int(row["events"]),
            "unique_skus": len(row["unique_skus"]),
        })

    history["weekly_summary"] = weekly_summary
    history["total_events"] = len(events)
    history["updated_at"] = _utc_now_iso_z()


def _append_removed_event(history: Dict[str, Any], event: Dict[str, Any]) -> bool:
    events = history.get("events") or []
    if not isinstance(events, list):
        events = []

    fp = _event_fingerprint(event)
    for old in events:
        if isinstance(old, dict) and _event_fingerprint(old) == fp:
            history["events"] = events
            _refresh_removed_history_meta(history)
            return False

    events.append(event)
    events = [e for e in events if isinstance(e, dict)]
    events.sort(key=lambda x: str(x.get("happened_at") or ""), reverse=True)

    if REMOVED_MAX_EVENTS > 0 and len(events) > REMOVED_MAX_EVENTS:
        events = events[:REMOVED_MAX_EVENTS]

    history["events"] = events
    _refresh_removed_history_meta(history)
    return True


def _build_removed_txt(history: Dict[str, Any]) -> str:
    events = history.get("events") or []
    weekly_summary = history.get("weekly_summary") or []
    updated_at = str(history.get("updated_at") or "").strip()
    total_events = int(history.get("total_events") or 0)

    lines: List[str] = []
    lines.append("========================================")
    lines.append("LINK GUARDIAN — PRODUTOS DESATIVADOS/REMOVIDOS")
    lines.append("========================================")
    lines.append(f"Atualizado em: {updated_at or _utc_now_iso_z()}")
    lines.append(f"Total de eventos: {total_events}")
    lines.append("")

    if weekly_summary:
        lines.append("RESUMO SEMANAL")
        lines.append("----------------------------------------")
        for row in weekly_summary:
            wk = str(row.get("week_key") or "").strip()
            evc = int(row.get("events") or 0)
            sku_count = int(row.get("unique_skus") or 0)
            lines.append(f"- {wk}: {evc} evento(s) | {sku_count} SKU(s)")
        lines.append("")

    if not events:
        lines.append("Nenhum produto desativado/removido registrado até agora.")
        lines.append("")
        return "\n".join(lines)

    grouped: Dict[str, List[Dict[str, Any]]] = {}
    for ev in events:
        if not isinstance(ev, dict):
            continue
        wk = str(ev.get("week_key") or "").strip() or _week_key_from_iso(ev.get("happened_at") or "")
        grouped.setdefault(wk, []).append(ev)

    lines.append("DETALHES POR SEMANA")
    lines.append("----------------------------------------")

    for wk in sorted(grouped.keys(), reverse=True):
        lines.append("")
        lines.append(f"### {wk}")
        lines.append("")

        bucket = sorted(grouped[wk], key=lambda x: str(x.get("happened_at") or ""), reverse=True)

        for ev in bucket:
            happened_at = str(ev.get("happened_at") or "").strip()
            sku = str(ev.get("sku") or "").strip()
            title = str(ev.get("title") or "").strip()
            status = str(ev.get("status") or "").strip()
            reason = str(ev.get("reason") or "").strip()
            event_type = str(ev.get("event_type") or "").strip()
            id_busca = str(ev.get("id_busca") or "").strip()
            checked_url = str(ev.get("checked_url") or "").strip()
            final_url = str(ev.get("final_url") or "").strip()
            open_url = str(ev.get("open_url") or "").strip()
            check_url = str(ev.get("check_url") or "").strip()
            canonical_url = str(ev.get("canonical_url") or "").strip()
            fail_count = str(ev.get("fail_count") or "").strip()
            fail_threshold = str(ev.get("fail_threshold") or "").strip()

            lines.append(f"* {happened_at} | {event_type} | {sku} | {title}")
            lines.append(f"  status={status} | reason={reason} | fail={fail_count}/{fail_threshold}")
            if id_busca:
                lines.append(f"  id_busca={id_busca}")
            if checked_url:
                lines.append(f"  checked_url={checked_url}")
            if final_url:
                lines.append(f"  final_url={final_url}")
            if open_url:
                lines.append(f"  open_url={open_url}")
            if check_url:
                lines.append(f"  check_url={check_url}")
            if canonical_url:
                lines.append(f"  canonical_url={canonical_url}")
            lines.append("")

    return "\n".join(lines).rstrip() + "\n"


def _save_removed_reports(history: Dict[str, Any]) -> None:
    _refresh_removed_history_meta(history)
    _write_json(REMOVED_JSON, history)
    _write_text(REMOVED_TXT, _build_removed_txt(history))


# =========================
# RELATÓRIO DE REVISÃO / MANUTENÇÃO
# =========================
def _load_review_history(path: Path) -> Dict[str, Any]:
    base = {
        "updated_at": "",
        "total_items": 0,
        "summary": {
            "unique_skus": 0,
            "by_state": {},
            "by_reason": {},
            "by_action": {},
            "high_priority": 0,
        },
        "items": [],
    }

    if not path.exists():
        return base

    try:
        with path.open("r", encoding="utf-8") as f:
            data = json.load(f)

        if not isinstance(data, dict):
            raise ValueError("json inválido")

        if not isinstance(data.get("items"), list):
            data["items"] = []

        if not isinstance(data.get("summary"), dict):
            data["summary"] = base["summary"].copy()

        if "updated_at" not in data:
            data["updated_at"] = ""

        if "total_items" not in data:
            data["total_items"] = len(data["items"])

        return data
    except Exception:
        return base



def _review_priority_from_reason(reason: str, action_suggested: str) -> str:
    r = (reason or "").strip().lower()
    a = (action_suggested or "").strip().lower()
    if "lists" in r or "lista" in r or "storefront" in r:
        return "alta"
    if a in {"trocar_link", "relink"}:
        return "alta"
    if "search" in r or "busca" in r:
        return "media"
    return "media"


def _apply_guardian_intelligence_fields(p: Dict[str, Any], res: CheckResult) -> Tuple[int, str, str]:
    score = _guardian_confidence_score(p, res)
    bucket = _guardian_confidence_bucket(score)
    reason_bucket = _guardian_reason_bucket(res)
    p["guardian_confidence_score"] = score
    p["guardian_confidence_bucket"] = bucket
    p["guardian_reason_bucket"] = reason_bucket
    return score, bucket, reason_bucket


def _review_state_label(state: str) -> str:
    s = (state or "").strip().lower()
    if s == "review_only_storefront":
        return "review_only_storefront"
    return s or "review_only"


def _trim_text_list(values: Any, limit: int = 8) -> List[str]:
    out: List[str] = []
    if not isinstance(values, list):
        return out
    for v in values:
        s = str(v or "").strip()
        if s and s not in out:
            out.append(s)
        if len(out) >= limit:
            break
    return out



def _build_review_item(
    p: Dict[str, Any],
    res: CheckResult,
    happened_at: str,
    action_suggested: str,
    memory_item: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    state = "review_only_storefront" if res.storefront_invalid else "review_only"
    priority = _review_priority_from_reason(res.reason, action_suggested)
    smart_categories = _trim_text_list(p.get("smart_categories") or p.get("categories") or [])
    badges = _trim_text_list(p.get("badges") or [])
    confidence_score = int(p.get("guardian_confidence_score") or _guardian_confidence_score(p, res))
    confidence_bucket = str(p.get("guardian_confidence_bucket") or _guardian_confidence_bucket(confidence_score)).strip()
    reason_bucket = str(p.get("guardian_reason_bucket") or _guardian_reason_bucket(res)).strip()
    memory_note = _memory_note_from_item(memory_item or {})
    return {
        "happened_at": happened_at,
        "state": state,
        "state_label": _review_state_label(state),
        "priority": priority,
        "issue_number": int(p.get("issue_number") or 0),
        "issue_url": _clean_url(p.get("issue_url") or ""),
        "issue_title": (p.get("issue_title") or "").strip(),
        "sku": (p.get("sku") or "").strip(),
        "title": (p.get("title") or "").strip(),
        "id_busca": (p.get("id_busca") or "").strip(),
        "status": int(res.status),
        "reason": res.reason,
        "reason_bucket": reason_bucket,
        "reason_bucket_label": _guardian_reason_bucket_label(reason_bucket),
        "confidence_score": confidence_score,
        "confidence_bucket": confidence_bucket,
        "memory_note": memory_note,
        "guardian_last_good_open_url": _clean_url(p.get("guardian_last_good_open_url") or ""),
        "guardian_last_good_check_url": _clean_url(p.get("guardian_last_good_check_url") or ""),
        "guardian_last_good_confirmed_at": str(p.get("guardian_last_good_confirmed_at") or "").strip(),
        "action_suggested": action_suggested,
        "needs_manual_check": True,
        "checked_url": _clean_url(res.checked_url or ""),
        "final_url": _clean_url(res.final_url or ""),
        "open_url": _clean_url(p.get("open_url") or ""),
        "check_url": _clean_url(p.get("check_url") or ""),
        "canonical_url": _clean_url(p.get("canonical_url") or ""),
        "short_url": _clean_url(p.get("short_url") or ""),
        "resolved_url": _clean_url(p.get("resolved_url") or ""),
        "guardian_last_final_url": _clean_url(p.get("guardian_last_final_url") or res.final_url or ""),
        "active": bool(p.get("active", True)),
        "featured": bool(p.get("featured", False)),
        "smart_categories": smart_categories,
        "badges": badges,
    }


def _review_fingerprint(item: Dict[str, Any]) -> str:
    return "|".join([
        str(item.get("state") or ""),
        str(item.get("issue_number") or ""),
        str(item.get("sku") or ""),
        str(item.get("reason") or ""),
        str(item.get("final_url") or ""),
        str(item.get("action_suggested") or ""),
    ])


def _refresh_review_history_meta(history: Dict[str, Any]) -> None:
    items = history.get("items") or []
    if not isinstance(items, list):
        items = []

    by_state: Dict[str, int] = {}
    by_reason: Dict[str, int] = {}
    by_action: Dict[str, int] = {}
    unique_skus = set()
    high_priority = 0

    for item in items:
        if not isinstance(item, dict):
            continue
        sku = str(item.get("sku") or "").strip()
        if sku:
            unique_skus.add(sku)
        state = str(item.get("state_label") or item.get("state") or "review_only").strip() or "review_only"
        reason = str(item.get("reason") or "").strip() or "sem_reason"
        action = str(item.get("action_suggested") or "").strip() or "revisar"
        priority = str(item.get("priority") or "").strip().lower()
        by_state[state] = by_state.get(state, 0) + 1
        by_reason[reason] = by_reason.get(reason, 0) + 1
        by_action[action] = by_action.get(action, 0) + 1
        if priority == "alta":
            high_priority += 1

    history["summary"] = {
        "unique_skus": len(unique_skus),
        "by_state": dict(sorted(by_state.items(), key=lambda kv: (-kv[1], kv[0]))),
        "by_reason": dict(sorted(by_reason.items(), key=lambda kv: (-kv[1], kv[0]))),
        "by_action": dict(sorted(by_action.items(), key=lambda kv: (-kv[1], kv[0]))),
        "high_priority": high_priority,
    }
    history["total_items"] = len([x for x in items if isinstance(x, dict)])
    history["updated_at"] = _utc_now_iso_z()


def _append_review_item(history: Dict[str, Any], item: Dict[str, Any]) -> bool:
    items = history.get("items") or []
    if not isinstance(items, list):
        items = []

    target_sku = str(item.get("sku") or "").strip()
    target_fp = _review_fingerprint(item)

    for old in items:
        if not isinstance(old, dict):
            continue
        old_sku = str(old.get("sku") or "").strip()
        old_fp = _review_fingerprint(old)
        if (target_sku and old_sku == target_sku) or (old_fp == target_fp):
            changed = old != item
            old.update(item)
            history["items"] = [x for x in items if isinstance(x, dict)]
            _refresh_review_history_meta(history)
            return changed

    items.append(item)
    items = [x for x in items if isinstance(x, dict)]
    priority_order = {"alta": 0, "media": 1, "baixa": 2}
    items.sort(
        key=lambda x: (
            priority_order.get(str(x.get("priority") or "media").strip().lower(), 9),
            str(x.get("happened_at") or ""),
        )
    )
    items.sort(key=lambda x: str(x.get("happened_at") or ""), reverse=True)

    if REVIEW_MAX_ITEMS > 0 and len(items) > REVIEW_MAX_ITEMS:
        items = items[:REVIEW_MAX_ITEMS]

    history["items"] = items
    _refresh_review_history_meta(history)
    return True

def _clear_review_items_for_sku(history: Dict[str, Any], sku: str) -> int:
    target = str(sku or "").strip()
    if not target:
        return 0

    items = history.get("items") or []
    if not isinstance(items, list):
        items = []

    kept = []
    removed = 0
    for item in items:
        if not isinstance(item, dict):
            continue
        if str(item.get("sku") or "").strip() == target:
            removed += 1
            continue
        kept.append(item)

    if removed:
        history["items"] = kept
        _refresh_review_history_meta(history)
    return removed

def _catalog_sku_set(products: List[Dict[str, Any]]) -> set[str]:
    out: set[str] = set()
    for p in products:
        if not isinstance(p, dict):
            continue
        sku = str(p.get("sku") or "").strip()
        if sku:
            out.add(sku)
    return out


def _catalog_issue_set(products: List[Dict[str, Any]]) -> set[int]:
    out: set[int] = set()
    for p in products:
        if not isinstance(p, dict):
            continue
        try:
            issue_number = int(p.get("issue_number") or 0)
        except Exception:
            issue_number = 0
        if issue_number > 0:
            out.add(issue_number)
    return out


def _purge_review_items_not_in_catalog(
    history: Dict[str, Any],
    valid_skus: set[str],
    valid_issue_numbers: set[int] | None = None,
) -> int:
    items = history.get("items") or []
    if not isinstance(items, list):
        items = []

    valid_issue_numbers = valid_issue_numbers or set()

    kept = []
    removed = 0
    for item in items:
        if not isinstance(item, dict):
            continue

        sku = str(item.get("sku") or "").strip()
        try:
            issue_number = int(item.get("issue_number") or 0)
        except Exception:
            issue_number = 0

        sku_missing = bool(sku) and sku not in valid_skus
        issue_missing = issue_number > 0 and issue_number not in valid_issue_numbers

        if sku_missing or issue_missing:
            removed += 1
            continue

        kept.append(item)

    if removed:
        history["items"] = kept
        _refresh_review_history_meta(history)
    return removed


def _purge_memory_items_not_in_catalog(memory: Dict[str, Any], valid_skus: set[str]) -> int:
    skus = memory.get("skus") or {}
    if not isinstance(skus, dict):
        memory["skus"] = {}
        _refresh_guardian_memory_meta(memory)
        return 0

    removed = 0
    kept: Dict[str, Any] = {}
    for sku, item in skus.items():
        sku_clean = str(sku or "").strip()
        if sku_clean and sku_clean in valid_skus:
            kept[sku_clean] = item
        else:
            removed += 1

    if removed:
        memory["skus"] = kept
        _refresh_guardian_memory_meta(memory)
    return removed


def _review_exec_group(item: Dict[str, Any]) -> str:
    action = str(item.get("action_suggested") or "").strip().lower()
    bucket = str(item.get("reason_bucket") or "").strip().lower()
    priority = str(item.get("priority") or "").strip().lower()
    confidence = int(item.get("confidence_score") or 0)
    if action in {"relink_prioritario", "trocar_link", "relink"} or priority == "alta":
        return "Corrigir agora"
    if bucket in {"storefront_profile_confirmed", "account_verification_wrapped_valid", "product_direct_valid", "generic_ok"}:
        return "Provável falso positivo"
    if confidence >= 55 or bucket.startswith("temporary_") or bucket in {"storefront_profile_needs_review", "storefront_profile_unconfirmed"}:
        return "Monitorar sem mexer"
    return "Pode remover do catálogo"


def _review_exec_order(name: str) -> int:
    order = {
        "Corrigir agora": 0,
        "Provável falso positivo": 1,
        "Monitorar sem mexer": 2,
        "Pode remover do catálogo": 3,
    }
    return order.get(str(name or "").strip(), 99)


def _build_review_txt(history: Dict[str, Any]) -> str:
    items = history.get("items") or []
    updated_at = str(history.get("updated_at") or "").strip()
    total_items = int(history.get("total_items") or 0)
    summary = history.get("summary") or {}
    by_state = summary.get("by_state") or {}
    by_reason = summary.get("by_reason") or {}
    by_action = summary.get("by_action") or {}
    high_priority = int(summary.get("high_priority") or 0)
    unique_skus = int(summary.get("unique_skus") or 0)

    lines: List[str] = []
    lines.append("========================================")
    lines.append("LINK GUARDIAN — PAINEL DE REVISÃO EXECUTIVO")
    lines.append("========================================")
    lines.append(f"Atualizado em: {updated_at or _utc_now_iso_z()}")
    lines.append(f"Itens pendentes: {total_items}")
    lines.append(f"SKUs únicos: {unique_skus}")
    lines.append(f"Prioridade alta: {high_priority}")
    lines.append("")

    if by_state:
        lines.append("RESUMO POR ESTADO")
        lines.append("----------------------------------------")
        for k, v in by_state.items():
            lines.append(f"- {k}: {int(v)}")
        lines.append("")

    if by_action:
        lines.append("RESUMO POR AÇÃO")
        lines.append("----------------------------------------")
        for k, v in by_action.items():
            lines.append(f"- {k}: {int(v)}")
        lines.append("")

    if by_reason:
        lines.append("TOP MOTIVOS")
        lines.append("----------------------------------------")
        top_reason_items = list(by_reason.items())[:10]
        for k, v in top_reason_items:
            lines.append(f"- {k}: {int(v)}")
        lines.append("")

    if not items:
        lines.append("Nenhum item pendente de revisão/manutenção no momento.")
        lines.append("")
        return "\n".join(lines)

    grouped: Dict[str, List[Dict[str, Any]]] = {}
    for item in items:
        if not isinstance(item, dict):
            continue
        group_name = _review_exec_group(item)
        grouped.setdefault(group_name, []).append(item)

    lines.append("BLOCOS EXECUTIVOS")
    lines.append("----------------------------------------")

    for group_name in sorted(grouped.keys(), key=_review_exec_order):
        group_items = grouped[group_name]
        lines.append("")
        lines.append(group_name.upper())
        lines.append("----------------------------------------")

        group_items = sorted(group_items, key=lambda x: str(x.get("happened_at") or ""), reverse=True)

        for item in group_items:
            if not isinstance(item, dict):
                continue
            pr = str(item.get("priority") or "media").strip().upper()
            state = str(item.get("state_label") or item.get("state") or "review_only").strip()
            lines.append(f"[{pr}] {state}")
            lines.append(f"Quando: {str(item.get('happened_at') or '').strip()}")
            issue_number = int(item.get("issue_number") or 0)
            issue_url = str(item.get("issue_url") or "").strip()
            if issue_number:
                lines.append(f"Issue: #{issue_number}")
            if issue_url:
                lines.append(f"Issue URL: {issue_url}")
            lines.append(f"SKU: {str(item.get('sku') or '').strip()}")
            lines.append(f"Título: {str(item.get('title') or '').strip()}")
            if str(item.get("id_busca") or "").strip():
                lines.append(f"ID ML: {str(item.get('id_busca') or '').strip()}")
            lines.append(f"Ação sugerida: {str(item.get('action_suggested') or '').strip()}")
            lines.append(f"Motivo: {str(item.get('reason') or '').strip()}")
            if str(item.get("reason_bucket_label") or "").strip():
                lines.append(f"Bucket do motivo: {str(item.get('reason_bucket_label') or '').strip()}")
            lines.append(f"Status HTTP: {str(item.get('status') or '').strip()}")
            lines.append(
                f"Confiança: {int(item.get('confidence_score') or 0)} "
                f"({str(item.get('confidence_bucket') or '').strip()})"
            )
            if str(item.get("memory_note") or "").strip():
                lines.append(f"Memória operacional: {str(item.get('memory_note') or '').strip()}")
            if str(item.get("guardian_last_good_confirmed_at") or "").strip():
                lines.append(f"Último link bom confirmado em: {str(item.get('guardian_last_good_confirmed_at') or '').strip()}")
            if str(item.get("guardian_last_good_open_url") or "").strip():
                lines.append(f"Último open_url bom: {str(item.get('guardian_last_good_open_url') or '').strip()}")
            if str(item.get("guardian_last_good_check_url") or "").strip():
                lines.append(f"Último check_url bom: {str(item.get('guardian_last_good_check_url') or '').strip()}")
            cats = item.get("smart_categories") or []
            if cats:
                lines.append("Categorias: " + ", ".join(str(x).strip() for x in cats if str(x).strip()))
            badges = item.get("badges") or []
            if badges:
                lines.append("Badges: " + ", ".join(str(x).strip() for x in badges if str(x).strip()))
            if str(item.get("open_url") or "").strip():
                lines.append(f"open_url: {str(item.get('open_url') or '').strip()}")
            if str(item.get("checked_url") or "").strip():
                lines.append(f"checked_url: {str(item.get('checked_url') or '').strip()}")
            if str(item.get("final_url") or "").strip():
                lines.append(f"final_url: {str(item.get('final_url') or '').strip()}")
            if str(item.get("canonical_url") or "").strip():
                lines.append(f"canonical_url: {str(item.get('canonical_url') or '').strip()}")
            lines.append("")

    return "\n".join(lines).rstrip() + "\n"


def _save_review_reports(history: Dict[str, Any]) -> None:
    _refresh_review_history_meta(history)
    _write_json(REVIEW_JSON, history)
    _write_text(REVIEW_TXT, _build_review_txt(history))


def main() -> int:
    data = _read_json(PRODUTOS_JSON)
    products: List[Dict[str, Any]] = data.get("products") or []

    if not isinstance(products, list):
        products = []

    review_history = _load_review_history(REVIEW_JSON)
    guardian_memory = _load_guardian_memory(MEMORY_JSON)
    review_items_added = 0
    review_items_cleared = 0
    purged_review_orphans = 0
    purged_memory_orphans = 0

    now = _utc_now_iso_z()

    checked = 0
    ok_count = 0
    diag_count = 0
    temp_count = 0
    store_invalid_count = 0
    corrupt_skipped = 0
    catalog_changed = 0

    valid_skus: set[str] = set()
    valid_issue_numbers: set[int] = set()

    for p in products:
        if not isinstance(p, dict):
            continue

        sku = (p.get("sku") or "").strip()
        if sku:
            valid_skus.add(sku)
        try:
            issue_number = int(p.get("issue_number") or 0)
        except Exception:
            issue_number = 0
        if issue_number > 0:
            valid_issue_numbers.add(issue_number)

        if _looks_corrupt_product(p):
            corrupt_skipped += 1
            print(f"[SKIP/CORRUPT] {sku or '<sem-sku>'}")
            continue

        candidates = _candidate_urls(p)
        if not candidates:
            print(f"[SKIP/NO-URL] {sku or '<sem-sku>'}")
            continue

        if MAX_CHECK > 0 and checked >= MAX_CHECK:
            break

        product_before = json.dumps(p, ensure_ascii=False, sort_keys=True)
        memory_item = _get_or_create_memory_item(guardian_memory, sku) if sku else {}
        res = _check_affiliate_pool(p, now) or _check_product_urls(p)
        _apply_guardian_intelligence_fields(p, res)

        if sku:
            _record_memory_observation(memory_item, p, res, now)

        if json.dumps(p, ensure_ascii=False, sort_keys=True) != product_before:
            catalog_changed += 1

        checked += 1

        if res.ok:
            ok_count += 1
            cleared = _clear_review_items_for_sku(review_history, sku)
            if cleared:
                review_items_cleared += cleared
                print(f"[OK/CLEAR] {sku} -> removido do painel de manutenção ({cleared})")
            else:
                print(f"[OK] {sku} status={res.status} reason={res.reason} final={_clean_url(res.final_url or '')}")
            continue

        diag_count += 1
        if res.temporary:
            temp_count += 1
        if res.storefront_invalid:
            store_invalid_count += 1

        action_suggested = "revisar"
        if res.storefront_invalid:
            action_suggested = "trocar_link"
        elif res.reason == "dead":
            action_suggested = "validar_manual"
        elif res.temporary:
            action_suggested = "monitorar"

        if memory_item and bool(memory_item.get("relink_priority")):
            action_suggested = "relink_prioritario"

        review_item = _build_review_item(
            p=p,
            res=res,
            happened_at=now,
            action_suggested=action_suggested,
            memory_item=memory_item,
        )
        if _append_review_item(review_history, review_item):
            review_items_added += 1

        print(
            f"[DIAG] {sku} status={res.status} reason={res.reason} "
            f"storefront_invalid={int(bool(res.storefront_invalid))} temp={int(bool(res.temporary))} "
            f"final={_clean_url(res.final_url or '')}"
        )

    if PURGE_REVIEW_ORPHANS:
        purged_review_orphans = _purge_review_items_not_in_catalog(
            review_history,
            valid_skus,
            valid_issue_numbers,
        )
        if purged_review_orphans:
            print(
                f"[REVIEW-PURGE] removidos {purged_review_orphans} item(ns) fantasma(s) "
                f"do painel (sku/issue fora do catálogo atual)"
            )

    if PURGE_MEMORY_ORPHANS:
        purged_memory_orphans = _purge_memory_items_not_in_catalog(guardian_memory, valid_skus)
        if purged_memory_orphans:
            print(f"[MEMORY-PURGE] removidos {purged_memory_orphans} SKU(s) órfãos da memória")

    # O Guardian agora grava apenas saude/failover dos links. Conteudo comercial,
    # imagem, featured e estado ativo continuam sob controle do CMS.
    if catalog_changed:
        data["updated_at"] = now
        data["catalog_schema_version"] = 2
        _write_json(PRODUTOS_JSON, data)
    _save_review_reports(review_history)
    _save_guardian_memory(guardian_memory)

    print("========================================")
    print("Link Guardian finalizado (failover afiliado ativo).")
    print(f"Checked: {checked} | Max: {MAX_CHECK}")
    print(f"OK: {ok_count} | DIAG: {diag_count} | TEMP: {temp_count}")
    print(f"STORE_INVALID: {store_invalid_count}")
    print(f"Corrupt skipped: {corrupt_skipped}")
    print(f"Review JSON: {REVIEW_JSON}")
    print(f"Review TXT: {REVIEW_TXT}")
    print(f"Memory JSON: {MEMORY_JSON}")
    print(f"Review items: {len(review_history.get('items') or [])}")
    print(f"Review items added: {review_items_added}")
    print(f"Review items cleared: {review_items_cleared}")
    print(f"Review orphans purged: {purged_review_orphans}")
    print(f"Memory orphans purged: {purged_memory_orphans}")
    print(f"Produtos com saude/failover atualizado: {catalog_changed}")
    print(f"FAIL_THRESHOLD: {FAIL_THRESHOLD} | STOREFRONT_INVALID_THRESHOLD: {STOREFRONT_INVALID_THRESHOLD} | REMOVE_ON_DEAD: {int(REMOVE_ON_DEAD)} | CONSERVATIVE_ON_BLOCK: {int(CONSERVATIVE_ON_BLOCK)}")
    print(f"SOCIAL_INVALID_FOR_STOREFRONT: {int(SOCIAL_INVALID_FOR_STOREFRONT)} | LISTA_INVALID_FOR_STOREFRONT: {int(LISTA_INVALID_FOR_STOREFRONT)} | SOCIAL_COUNTS_AS_OK: {int(SOCIAL_COUNTS_AS_OK)} | STOREFRONT_REVIEW_ONLY: {int(STOREFRONT_REVIEW_ONLY)}")
    print(f"PURGE_REVIEW_ORPHANS: {int(PURGE_REVIEW_ORPHANS)} | PURGE_MEMORY_ORPHANS: {int(PURGE_MEMORY_ORPHANS)}")
    print(f"DEAD_ON_BODY: {int(DEAD_ON_BODY)} | MAX_CANDIDATE_URLS: {MAX_CANDIDATE_URLS}")
    print(f"RECOVER_ON_TEMP: {int(RECOVER_ON_TEMP)} | RECOVER_MAX_DAYS: {RECOVER_MAX_DAYS}")
    print(f"BOOTSTRAP_IF_ZERO: {int(BOOTSTRAP_IF_ZERO)} | BOOTSTRAP_MAX_DAYS: {BOOTSTRAP_MAX_DAYS}")
    print(f"FORCE_RESTORE_ALL_IF_ZERO: {int(FORCE_RESTORE_ALL_IF_ZERO)}")
    print(f"FAILSAFE_MIN_ACTIVE: {FAILSAFE_MIN_ACTIVE} | FAILSAFE_MIN_RATIO: {FAILSAFE_MIN_RATIO}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
