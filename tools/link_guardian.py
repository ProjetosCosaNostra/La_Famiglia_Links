
# ==========================================================
# Arquivo: tools/link_guardian.py
# Módulo : Link Guardian — Checa links e mantém vitrine operacional
# Versão : v8 (LISTA INVALID + UNWRAP ACCOUNT VERIFICATION + PROMOÇÃO DE URL VÁLIDA)
#
# Objetivo (prioridade de negócio):
#   1) NUNCA mais deixar a loja “zerada” por falso-positivo.
#   2) Evitar desativar produto por bloqueio/anti-bot/ruído.
#   3) Produto de vitrine precisa apontar para destino real de produto.
#      /social/, /lists, lista.* e account-verification com go inválido NÃO servem.
#   4) Se existir URL alternativa real/boa, o Guardian promove essa URL para o produto.
#   5) Produto do Dia (featured) NUNCA automático.
#   6) Registrar histórico de produtos desativados/removidos:
#      - data/link_guardian_removed.json
#      - logs/link_guardian_removed.txt
#
# Regras:
#   - Se active_before == 0: restaura (bootstrap) e, se necessário, FORCE-RESTORE.
#   - 403/429/captcha/anti-bot => TEMP (não conta falha).
#   - 5xx/timeout => TEMP (não conta falha).
#   - 404/410 => HARD DEAD (pode desativar após FAIL_THRESHOLD).
#   - storefront invalid => DESATIVA com threshold próprio (default 1).
#   - “dead por conteúdo” (status 200) só se LG_DEAD_ON_BODY=1.
# ==========================================================

from __future__ import annotations

import gzip
import json
import os
import re
import time
import unicodedata
import urllib.error
import urllib.request
from html import unescape
from dataclasses import dataclass
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any, Dict, List, Tuple
from urllib.parse import parse_qs, unquote, urlparse


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

REVIEW_THRESHOLD = int(os.environ.get("LG_REVIEW_THRESHOLD", "2"))
SEARCH_OK_SCORE = int(os.environ.get("LG_SEARCH_OK_SCORE", "7"))
SEARCH_REVIEW_SCORE = int(os.environ.get("LG_SEARCH_REVIEW_SCORE", "4"))
TITLE_TOKEN_MIN_MATCH = int(os.environ.get("LG_TITLE_TOKEN_MIN_MATCH", "2"))
BODY_SAMPLE_RANGE = os.environ.get("LG_BODY_SAMPLE_RANGE", "bytes=0-131071")



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
    review_only: bool = False
    confidence: int = 0
    evidence: str = ""
    state: str = ""


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


def _clean_ml_id(value: str) -> str:
    x = re.sub(r"[^A-Za-z0-9-]", "", str(value or "").upper())
    return x.strip()


def _ml_search_url(id_busca: str) -> str:
    ib = _clean_ml_id(id_busca or "")
    return f"https://lista.mercadolivre.com.br/{ib}" if ib else ""


_STOPWORDS = {
    "a", "o", "os", "as", "de", "da", "do", "das", "dos", "e", "em", "para", "por",
    "com", "sem", "no", "na", "nos", "nas", "um", "uma", "uns", "umas", "ao", "aos",
    "ou", "the", "and", "of", "for", "to", "premium", "produto", "original", "versao",
    "versão", "global", "preto", "preta", "branco", "branca", "azul", "rosa", "cinza",
    "carregador", "power", "bank", "premium", "smart", "band", "led", "touch", "pet",
    "spa", "robot", "nexode", "gan", "usb", "tipo", "porta", "porta", "portatil", "portátil",
    "executiva", "executivo", "mochila", "xiaomi", "ugreen", "kingston", "luminaria", "luminária",
    "webcam", "escova", "cachorros", "gatos", "casa", "pc", "notebook", "mouse", "gamer",
}


def _normalize_text(value: str) -> str:
    x = unescape(str(value or ""))
    x = unicodedata.normalize("NFKD", x)
    x = "".join(ch for ch in x if not unicodedata.combining(ch))
    x = x.lower()
    x = re.sub(r"[^a-z0-9]+", " ", x)
    return re.sub(r"\s+", " ", x).strip()


def _tokenize_text(value: str) -> List[str]:
    out: List[str] = []
    seen = set()
    for tok in _normalize_text(value).split():
        if len(tok) < 2:
            continue
        if tok in _STOPWORDS:
            continue
        if tok.isdigit():
            continue
        if tok in seen:
            continue
        seen.add(tok)
        out.append(tok)
    return out


def _strip_html_to_text(sample: str) -> str:
    x = unescape(sample or "")
    x = re.sub(r"(?is)<script[^>]*>.*?</script>", " ", x)
    x = re.sub(r"(?is)<style[^>]*>.*?</style>", " ", x)
    x = re.sub(r"(?s)<[^>]+>", " ", x)
    return _normalize_text(x)


def _is_storefront_like(u: str) -> bool:
    return _is_social_path(u) or _is_lista_url(u)


def _collect_product_tokens(p: Dict[str, Any]) -> List[str]:
    tokens: List[str] = []
    seen = set()
    title = str(p.get("title") or "")
    sku = str(p.get("sku") or "")
    id_busca = str(p.get("id_busca") or "")
    badges = p.get("badges") or []
    for value in [title, sku, id_busca] + ([" ".join(str(x) for x in badges)] if isinstance(badges, list) else []):
        for tok in _tokenize_text(value):
            if tok in seen:
                continue
            seen.add(tok)
            tokens.append(tok)
        if len(tokens) >= 14:
            break
    return tokens


def _join_evidence(parts: List[str]) -> str:
    clean = [str(x).strip() for x in parts if str(x).strip()]
    return ", ".join(clean)


def _compute_product_evidence(p: Dict[str, Any], checked_url: str, final_url: str, body_sample: str) -> Tuple[int, List[str], int]:
    score = 0
    evidence: List[str] = []
    title_match_count = 0

    id_busca = _clean_ml_id(p.get("id_busca") or "")
    title_tokens = _collect_product_tokens(p)
    body_text = _strip_html_to_text(body_sample)
    checked_lower = (checked_url or "").lower()
    final_lower = (final_url or "").lower()

    if id_busca:
        id_lower = id_busca.lower()
        if id_lower in checked_lower or id_lower in final_lower:
            score += 4
            evidence.append("id_url")
        if id_lower in body_text:
            score += 6
            evidence.append("id_body")

    matched_tokens = []
    for tok in title_tokens:
        if tok in body_text:
            matched_tokens.append(tok)

    title_match_count = len(matched_tokens)
    if title_match_count >= TITLE_TOKEN_MIN_MATCH:
        score += min(4, title_match_count)
        evidence.append(f"title_tokens:{title_match_count}")

    if _looks_like_product_destination(final_url):
        score += 10
        evidence.append("product_destination")

    if _is_social_profile_path(final_url):
        score += 2
        evidence.append("social_profile")
    elif _is_social_lists_path(final_url):
        evidence.append("social_lists")
    elif _is_lista_url(final_url):
        evidence.append("lista_search")

    if any(marker in body_text for marker in ("comprar agora", "ir para produto", "ver produto", "compre agora", "comprar")):
        score += 1
        evidence.append("cta")

    return score, evidence, title_match_count


def _result_rank(res: CheckResult) -> int:
    if res.ok and res.promoted_url and _looks_like_product_destination(res.promoted_url or res.final_url):
        return 500 + int(res.confidence)
    if res.ok and res.reason == "storefront_search_confirmed":
        return 450 + int(res.confidence)
    if res.ok:
        return 400 + int(res.confidence)
    if res.review_only:
        return 300 + int(res.confidence)
    if res.hard_dead:
        return 200 + int(res.status)
    if res.temporary:
        return 100 + int(res.status)
    return int(res.confidence)


def _classify_fetched_page(checked_url: str, status: int, final_url: str, body_sample: str, p: Dict[str, Any]) -> CheckResult:
    final_url = _clean_url(final_url or checked_url)

    if status == 0:
        return CheckResult(
            ok=False, temporary=True, status=0, final_url=final_url, reason="sem_resposta",
            hard_dead=False, checked_url=checked_url, storefront_invalid=False,
            confidence=0, evidence="sem_resposta", state="temp",
        )

    if CONSERVATIVE_ON_BLOCK and _is_block_page(status, final_url, body_sample):
        return CheckResult(
            ok=False, temporary=True, status=status, final_url=final_url, reason="bloqueio",
            hard_dead=False, checked_url=checked_url, storefront_invalid=False,
            confidence=0, evidence="bloqueio", state="temp",
        )

    if TREAT_5XX_TEMP and status in _TEMP_STATUS:
        return CheckResult(
            ok=False, temporary=True, status=status, final_url=final_url, reason=f"temp_{status}",
            hard_dead=False, checked_url=checked_url, storefront_invalid=False,
            confidence=0, evidence=f"status:{status}", state="temp",
        )

    if _is_definitely_dead(status, final_url, body_sample):
        hard = status in _HARD_DEAD_STATUS
        return CheckResult(
            ok=False, temporary=False, status=status, final_url=final_url, reason="dead",
            hard_dead=hard, checked_url=checked_url, storefront_invalid=False,
            confidence=0, evidence=f"status:{status}", state="dead",
        )

    score, evidence_parts, title_match_count = _compute_product_evidence(p, checked_url, final_url, body_sample)
    evidence = _join_evidence(evidence_parts)

    if _looks_like_product_destination(final_url):
        return CheckResult(
            ok=True, temporary=False, status=status, final_url=final_url, reason="ok_product_destination",
            hard_dead=False, checked_url=checked_url, storefront_invalid=False, promoted_url=final_url,
            confidence=score, evidence=evidence, state="ok_product",
        )

    if _is_storefront_like(final_url):
        strong = ("id_body" in evidence_parts) or (title_match_count >= TITLE_TOKEN_MIN_MATCH)
        if score >= SEARCH_OK_SCORE and strong:
            return CheckResult(
                ok=True, temporary=False, status=status, final_url=final_url, reason="storefront_search_confirmed",
                hard_dead=False, checked_url=checked_url, storefront_invalid=False, promoted_url="",
                confidence=score, evidence=evidence, state="ok_storefront_confirmed",
            )

        if score >= SEARCH_REVIEW_SCORE:
            return CheckResult(
                ok=False, temporary=False, status=status, final_url=final_url, reason="storefront_intermediate_review",
                hard_dead=False, checked_url=checked_url, storefront_invalid=False, promoted_url="",
                review_only=True, confidence=score, evidence=evidence, state="review_intermediate",
            )

        return CheckResult(
            ok=False, temporary=False, status=status, final_url=final_url, reason="storefront_unconfirmed_review",
            hard_dead=False, checked_url=checked_url, storefront_invalid=False, promoted_url="",
            review_only=True, confidence=score, evidence=evidence or "storefront_sem_evidencia", state="review_low_conf",
        )

    return CheckResult(
        ok=True, temporary=False, status=status, final_url=final_url, reason="ok_ml_generic",
        hard_dead=False, checked_url=checked_url, storefront_invalid=False, promoted_url="",
        confidence=score, evidence=evidence or "ml_generic", state="ok_generic",
    )


def _check_url_for_product(url: str, p: Dict[str, Any]) -> CheckResult:
    u = _clean_url(url)

    if not u:
        return CheckResult(
            ok=False, temporary=False, status=0, final_url="", reason="sem_url", hard_dead=False, checked_url=u, storefront_invalid=False,
            confidence=0, evidence="sem_url", state="invalid",
        )

    if not _is_ml_url(u):
        return CheckResult(
            ok=False, temporary=False, status=0, final_url=u, reason="nao_ml", hard_dead=False, checked_url=u, storefront_invalid=False,
            confidence=0, evidence="nao_ml", state="invalid",
        )

    status, final_url, sample = _fetch_status_and_sample(u)
    final_url = _clean_url(final_url or u)

    unwrapped = _unwrap_account_verification(final_url)
    if unwrapped and _is_ml_url(unwrapped):
        status2, final2, sample2 = _fetch_status_and_sample(unwrapped)
        final2 = _clean_url(final2 or unwrapped)
        res2 = _classify_fetched_page(u, status2, final2, sample2, p)
        if res2.ok or res2.review_only or res2.temporary or res2.hard_dead:
            if not res2.evidence:
                res2.evidence = _join_evidence([res2.evidence, "unwrapped"])
            else:
                res2.evidence = _join_evidence([res2.evidence, "unwrapped"])
            return res2

    return _classify_fetched_page(u, status, final_url, sample, p)


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
        "Range": BODY_SAMPLE_RANGE,
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
    return _check_url_for_product(url, {})

def _check_product_urls(p: Dict[str, Any]) -> CheckResult:
    candidates = _candidate_urls(p)

    if not candidates:
        fallback = _ml_search_url(p.get("id_busca") or "")
        candidates = [fallback] if fallback else []

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
            confidence=0,
            evidence="sem_url",
            state="invalid",
        )

    best: CheckResult | None = None

    for url in candidates:
        res = _check_url_for_product(url, p)

        if best is None or _result_rank(res) > _result_rank(best):
            best = res

        if res.ok and res.promoted_url and _looks_like_product_destination(res.promoted_url or res.final_url):
            return res

    return best or CheckResult(
        ok=False,
        temporary=False,
        status=0,
        final_url="",
        reason="sem_url",
        hard_dead=False,
        checked_url="",
        storefront_invalid=False,
        confidence=0,
        evidence="sem_url",
        state="invalid",
    )


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


def _clear_review_markers(p: Dict[str, Any]) -> None:
    for k in (
        "guardian_review_flag",
        "guardian_review_reason",
        "guardian_review_at",
        "guardian_review_count",
        "guardian_evidence_score",
        "guardian_last_evidence",
        "guardian_last_state",
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
    if not path.exists():
        return {
            "updated_at": "",
            "total_items": 0,
            "items": [],
        }

    try:
        with path.open("r", encoding="utf-8") as f:
            data = json.load(f)

        if not isinstance(data, dict):
            raise ValueError("json inválido")

        if not isinstance(data.get("items"), list):
            data["items"] = []

        if "updated_at" not in data:
            data["updated_at"] = ""

        if "total_items" not in data:
            data["total_items"] = len(data["items"])

        return data
    except Exception:
        return {
            "updated_at": "",
            "total_items": 0,
            "items": [],
        }


def _build_review_item(
    p: Dict[str, Any],
    res: CheckResult,
    happened_at: str,
    action_suggested: str,
) -> Dict[str, Any]:
    return {
        "happened_at": happened_at,
        "issue_number": int(p.get("issue_number") or 0),
        "issue_url": _clean_url(p.get("issue_url") or ""),
        "issue_title": (p.get("issue_title") or "").strip(),
        "sku": (p.get("sku") or "").strip(),
        "title": (p.get("title") or "").strip(),
        "id_busca": (p.get("id_busca") or "").strip(),
        "status": int(res.status),
        "reason": res.reason,
        "action_suggested": action_suggested,
        "checked_url": _clean_url(res.checked_url or ""),
        "final_url": _clean_url(res.final_url or ""),
        "open_url": _clean_url(p.get("open_url") or ""),
        "check_url": _clean_url(p.get("check_url") or ""),
        "canonical_url": _clean_url(p.get("canonical_url") or ""),
        "short_url": _clean_url(p.get("short_url") or ""),
        "resolved_url": _clean_url(p.get("resolved_url") or ""),
        "confidence": int(res.confidence or 0),
        "evidence": (res.evidence or "").strip(),
        "state": (res.state or "").strip(),
    }


def _review_fingerprint(item: Dict[str, Any]) -> str:
    return "|".join([
        str(item.get("issue_number") or ""),
        str(item.get("sku") or ""),
        str(item.get("reason") or ""),
        str(item.get("final_url") or ""),
        str(item.get("action_suggested") or ""),
    ])


def _append_review_item(history: Dict[str, Any], item: Dict[str, Any]) -> bool:
    items = history.get("items") or []
    if not isinstance(items, list):
        items = []

    fp = _review_fingerprint(item)
    for old in items:
        if isinstance(old, dict) and _review_fingerprint(old) == fp:
            old.update(item)
            history["items"] = items
            history["total_items"] = len(items)
            history["updated_at"] = _utc_now_iso_z()
            return False

    items.append(item)
    items = [x for x in items if isinstance(x, dict)]
    items.sort(key=lambda x: str(x.get("happened_at") or ""), reverse=True)

    if REVIEW_MAX_ITEMS > 0 and len(items) > REVIEW_MAX_ITEMS:
        items = items[:REVIEW_MAX_ITEMS]

    history["items"] = items
    history["total_items"] = len(items)
    history["updated_at"] = _utc_now_iso_z()
    return True


def _remove_review_items_for_sku(history: Dict[str, Any], sku: str) -> int:
    key = str(sku or "").strip()
    if not key:
        return 0

    items = history.get("items") or []
    if not isinstance(items, list):
        items = []

    kept = []
    removed = 0
    for item in items:
        if isinstance(item, dict) and str(item.get("sku") or "").strip() == key:
            removed += 1
            continue
        kept.append(item)

    history["items"] = kept
    history["total_items"] = len(kept)
    history["updated_at"] = _utc_now_iso_z()
    return removed


def _build_review_txt(history: Dict[str, Any]) -> str:
    items = history.get("items") or []
    updated_at = str(history.get("updated_at") or "").strip()
    total_items = int(history.get("total_items") or 0)

    lines: List[str] = []
    lines.append("========================================")
    lines.append("LINK GUARDIAN — REVISÃO / MANUTENÇÃO")
    lines.append("========================================")
    lines.append(f"Atualizado em: {updated_at or _utc_now_iso_z()}")
    lines.append(f"Total de itens: {total_items}")
    lines.append("")

    if not items:
        lines.append("Nenhum item em revisão/manutenção no momento.")
        lines.append("")
        return "\n".join(lines)

    for item in items:
        if not isinstance(item, dict):
            continue
        lines.append("[MANUTENÇÃO] Produto suspeito")
        lines.append(f"Happened at: {str(item.get('happened_at') or '').strip()}")
        issue_number = int(item.get('issue_number') or 0)
        issue_url = str(item.get('issue_url') or '').strip()
        if issue_number:
            lines.append(f"Issue: #{issue_number}")
        if issue_url:
            lines.append(f"Issue URL: {issue_url}")
        lines.append(f"SKU: {str(item.get('sku') or '').strip()}")
        lines.append(f"Título: {str(item.get('title') or '').strip()}")
        if str(item.get("id_busca") or "").strip():
            lines.append(f"ID ML: {str(item.get('id_busca') or '').strip()}")
        lines.append(f"Link atual: {str(item.get('open_url') or '').strip()}")
        lines.append(f"Destino detectado: {str(item.get('final_url') or '').strip()}")
        lines.append(f"Classificação: {str(item.get('reason') or '').strip()}")
        if int(item.get("confidence") or 0):
            lines.append(f"Confiança: {int(item.get('confidence') or 0)}")
        if str(item.get("evidence") or "").strip():
            lines.append(f"Evidência: {str(item.get('evidence') or '').strip()}")
        lines.append(f"Ação sugerida: {str(item.get('action_suggested') or '').strip()}")
        if str(item.get("checked_url") or "").strip():
            lines.append(f"checked_url: {str(item.get('checked_url') or '').strip()}")
        if str(item.get("canonical_url") or "").strip():
            lines.append(f"canonical_url: {str(item.get('canonical_url') or '').strip()}")
        lines.append("")

    return "\n".join(lines).rstrip() + "\n"


def _save_review_reports(history: Dict[str, Any]) -> None:
    history["updated_at"] = _utc_now_iso_z()
    history["total_items"] = len(history.get("items") or [])
    _write_json(REVIEW_JSON, history)
    _write_text(REVIEW_TXT, _build_review_txt(history))


def main() -> int:
    data = _read_json(PRODUTOS_JSON)
    products: List[Dict[str, Any]] = data.get("products") or []

    if not isinstance(products, list):
        products = []

    removed_history = _load_removed_history(REMOVED_JSON)
    review_history = _load_review_history(REVIEW_JSON)
    removed_events_added = 0
    review_items_added = 0
    review_items_removed = 0
    pending_actions: Dict[str, Dict[str, Any]] = {}

    cleaned: List[Dict[str, Any]] = []
    removed_corrupt = 0

    for p in products:
        if not isinstance(p, dict):
            removed_corrupt += 1
            continue
        if _looks_corrupt_product(p):
            removed_corrupt += 1
            continue
        cleaned.append(p)

    if removed_corrupt:
        print(f"AVISO: removi {removed_corrupt} item(ns) corrompido(s) do produtos.json.")

    products = cleaned

    active_before_raw = sum(1 for p in products if isinstance(p, dict) and bool(p.get("active")))

    if BOOTSTRAP_IF_ZERO and active_before_raw == 0 and len(products) >= 1:
        boosted = 0
        for p in products:
            if not isinstance(p, dict):
                continue
            last_ok = (p.get("last_ok") or "").strip()
            if last_ok and _recent_enough(last_ok, BOOTSTRAP_MAX_DAYS):
                if not bool(p.get("active")):
                    p["active"] = True
                    p["guardian_fail_count"] = 0
                    _clear_dead_markers(p)
                    boosted += 1

        print("========================================")
        print("BOOTSTRAP ATIVADO (loja estava zerada):")
        print(f"Reativados via last_ok (<= {BOOTSTRAP_MAX_DAYS}d): {boosted}/{len(products)}")
        print("========================================")

    active_after_bootstrap = sum(1 for p in products if isinstance(p, dict) and bool(p.get("active")))

    if FORCE_RESTORE_ALL_IF_ZERO and active_after_bootstrap == 0 and len(products) >= 1:
        boosted_all = _force_restore_all(products)
        print("========================================")
        print("FORCE-RESTORE ATIVADO (ainda zerada):")
        print(f"Reativados (emergência): {boosted_all}/{len(products)}")
        print("========================================")

    orig: Dict[str, Tuple[bool, bool, int]] = {}
    for p in products:
        if isinstance(p, dict):
            sku = (p.get("sku") or "").strip()
            if sku:
                orig[sku] = (
                    bool(p.get("active")),
                    bool(p.get("featured")),
                    int(p.get("guardian_fail_count") or 0),
                )

    active_before = sum(1 for p in products if isinstance(p, dict) and bool(p.get("active")))
    now = _utc_now_iso_z()

    checked = 0
    ok_count = 0
    dead_count = 0
    temp_count = 0
    store_invalid_count = 0
    removed_dead = 0
    changed = 0

    products_sorted = sorted([p for p in products if isinstance(p, dict)], key=_sort_key)
    out: List[Dict[str, Any]] = []

    for p in products_sorted:
        if MAX_CHECK > 0 and checked >= MAX_CHECK:
            out.append(p)
            continue

        override = str(p.get("guardian_override") or "").strip().lower()
        if override in {"ok", "ignore", "trusted"}:
            sku = (p.get("sku") or "").strip()
            p["guardian_last_checked"] = now
            p["guardian_last_status"] = 200
            p["guardian_last_reason"] = "manual_ok"
            p["guardian_last_state"] = "manual_ok"
            p["guardian_last_checked_url"] = _clean_url(p.get("open_url") or p.get("check_url") or "")
            p["guardian_last_final_url"] = _clean_url(p.get("open_url") or p.get("check_url") or "")
            p["guardian_last_evidence"] = "guardian_override=ok"
            p["guardian_evidence_score"] = 99
            p["last_checked"] = now
            p["last_ok"] = now
            p["guardian_fail_count"] = 0
            _clear_dead_markers(p)
            _clear_review_markers(p)
            review_items_removed += _remove_review_items_for_sku(review_history, sku)
            if not bool(p.get("active")):
                p["active"] = True
                changed += 1
            ok_count += 1
            checked += 1
            print(f"[MANUAL-OK] {sku}")
            out.append(p)
            time.sleep(SLEEP_BETWEEN)
            continue

        candidates = _candidate_urls(p)
        if not candidates:
            fallback_url = _ml_search_url(p.get("id_busca") or "")
            if fallback_url:
                candidates = [fallback_url]
            else:
                out.append(p)
                continue

        sku = (p.get("sku") or "").strip()
        was_active = bool(p.get("active"))
        was_featured = bool(p.get("featured"))

        res = _check_product_urls(p)

        p["guardian_last_checked"] = now
        p["guardian_last_status"] = int(res.status)
        p["guardian_last_final_url"] = _clean_url(res.final_url)
        p["guardian_last_reason"] = res.reason
        p["guardian_last_checked_url"] = _clean_url(res.checked_url)
        p["guardian_last_state"] = (res.state or "").strip()
        p["guardian_last_evidence"] = (res.evidence or "").strip()
        p["guardian_evidence_score"] = int(res.confidence or 0)
        p["last_checked"] = now
        checked += 1

        if res.temporary:
            temp_count += 1

            if RECOVER_ON_TEMP and (not was_active):
                last_ok = (p.get("last_ok") or "").strip()
                if last_ok and _recent_enough(last_ok, RECOVER_MAX_DAYS):
                    p["active"] = True
                    p["guardian_fail_count"] = 0
                    _clear_dead_markers(p)
                    changed += 1
                    print(f"[RECOVER/TEMP] {sku} -> REATIVADO via last_ok (status={res.status}, final={p.get('guardian_last_final_url', '')})")
                else:
                    print(f"[TEMP] {sku} status={res.status} reason={res.reason} final={p.get('guardian_last_final_url', '')}")
            else:
                print(f"[TEMP] {sku} status={res.status} reason={res.reason} final={p.get('guardian_last_final_url', '')}")

            out.append(p)
            time.sleep(SLEEP_BETWEEN)
            continue

        if res.ok:
            ok_count += 1
            p["last_ok"] = now

            if int(p.get("guardian_fail_count") or 0) != 0:
                p["guardian_fail_count"] = 0
                changed += 1
            else:
                p["guardian_fail_count"] = 0

            _clear_dead_markers(p)
            _clear_review_markers(p)
            review_items_removed += _remove_review_items_for_sku(review_history, sku)

            promoted = _promote_valid_url(p, res.promoted_url or res.final_url or res.checked_url)
            if promoted:
                changed += promoted

            if AUTO_REACTIVATE and (not was_active):
                p["active"] = True
                changed += 1
                print(f"[OK] {sku} -> REATIVADO ({res.reason}) via {_clean_url(res.promoted_url or res.final_url or res.checked_url)}")
            else:
                print(f"[OK] {sku} status={res.status} ({res.reason}) via {_clean_url(res.promoted_url or res.final_url or res.checked_url)}")

            out.append(p)
            time.sleep(SLEEP_BETWEEN)
            continue

        if res.review_only:
            review_count = int(p.get("guardian_review_count") or 0) + 1
            p["guardian_review_count"] = review_count
            p["guardian_review_flag"] = True
            p["guardian_review_reason"] = res.reason
            p["guardian_review_at"] = now

            if review_count >= REVIEW_THRESHOLD:
                review_item = _build_review_item(
                    p=p,
                    res=res,
                    happened_at=now,
                    action_suggested="revisar_link_manual" if "unconfirmed" in (res.reason or "") else "observar",
                )
                if _append_review_item(review_history, review_item):
                    review_items_added += 1
                print(f"[REVIEW] {sku} status={res.status} reason={res.reason} conf={res.confidence} final={p.get('guardian_last_final_url', '')}")
            else:
                print(f"[REVIEW-PENDING] {sku} status={res.status} reason={res.reason} conf={res.confidence} ({review_count}/{REVIEW_THRESHOLD})")

            out.append(p)
            time.sleep(SLEEP_BETWEEN)
            continue

        review_items_removed += _remove_review_items_for_sku(review_history, sku)
        dead_count += 1

        if res.storefront_invalid:
            store_invalid_count += 1

        should_count_as_fail = bool(res.hard_dead or DEAD_ON_BODY or res.storefront_invalid)

        if res.storefront_invalid and STOREFRONT_REVIEW_ONLY:
            p["guardian_review_flag"] = True
            p["guardian_review_reason"] = res.reason
            p["guardian_review_at"] = now
            review_item = _build_review_item(
                p=p,
                res=res,
                happened_at=now,
                action_suggested="trocar_link" if "lists" in (res.reason or "") or "listing" in (res.reason or "") else "revisar",
            )
            if _append_review_item(review_history, review_item):
                review_items_added += 1
            print(f"[REVIEW] {sku} status={res.status} reason={res.reason} final={p.get('guardian_last_final_url', '')}")
            out.append(p)
            time.sleep(SLEEP_BETWEEN)
            continue

        if not should_count_as_fail:
            temp_count += 1
            print(f"[SUSPEITO->TEMP] {sku} status={res.status} reason={res.reason} final={p.get('guardian_last_final_url', '')}")
            out.append(p)
            time.sleep(SLEEP_BETWEEN)
            continue

        fail_count = int(p.get("guardian_fail_count") or 0) + 1
        p["guardian_fail_count"] = fail_count
        p["guardian_dead_status"] = int(res.status)
        p["guardian_dead_reason"] = res.reason

        if res.storefront_invalid:
            p["guardian_storefront_invalid"] = True

        effective_threshold = STOREFRONT_INVALID_THRESHOLD if res.storefront_invalid else FAIL_THRESHOLD

        if fail_count >= effective_threshold:
            disabled_now = False

            if was_active:
                p["active"] = False
                changed += 1
                disabled_now = True

            if was_featured:
                p["featured"] = False
                changed += 1

            p["guardian_disabled_at"] = now
            changed += 1

            if res.storefront_invalid:
                print(f"[STORE_INVALID] {sku} status={res.status} -> DESATIVADO (fail={fail_count}/{effective_threshold}) final={p.get('guardian_last_final_url', '')}")
            else:
                print(f"[DEAD] {sku} status={res.status} -> DESATIVADO (fail={fail_count}/{effective_threshold})")

            pending_actions[sku] = {
                "disabled_event": _build_removed_event(
                    p=p,
                    res=res,
                    happened_at=now,
                    event_type="disabled_from_storefront" if res.storefront_invalid else "disabled",
                    fail_count=fail_count,
                    fail_threshold=effective_threshold,
                    was_active=was_active,
                    was_featured=was_featured,
                ) if disabled_now else None,
                "remove_event": _build_removed_event(
                    p=p,
                    res=res,
                    happened_at=now,
                    event_type="removed_from_catalog",
                    fail_count=fail_count,
                    fail_threshold=effective_threshold,
                    was_active=was_active,
                    was_featured=was_featured,
                ) if REMOVE_ON_DEAD else None,
                "remove_from_catalog": bool(REMOVE_ON_DEAD),
            }
        else:
            if res.storefront_invalid:
                print(f"[STORE_INVALID] {sku} status={res.status} (fail={fail_count}/{effective_threshold}) final={p.get('guardian_last_final_url', '')}")
            else:
                print(f"[FAIL] {sku} status={res.status} (fail={fail_count}/{effective_threshold})")

        out.append(p)
        time.sleep(SLEEP_BETWEEN)

    active_after = sum(1 for p in out if isinstance(p, dict) and bool(p.get("active")))
    min_allowed = max(FAILSAFE_MIN_ACTIVE, int(active_before * FAILSAFE_MIN_RATIO) if active_before else 0)

    if active_before > 0 and active_after < min_allowed:
        print("========================================")
        print("FAILSAFE (ANTI-WIPE) ATIVADO:")
        print(f"Active before: {active_before} | Active after: {active_after} | Min allowed: {min_allowed}")
        print("=> Revertendo active/featured/fail_count para evitar loja zerada por falso-positivo.")

        for p in out:
            if not isinstance(p, dict):
                continue
            sku = (p.get("sku") or "").strip()
            if not sku or sku not in orig:
                continue
            a, f, fc = orig[sku]
            p["active"] = a
            p["featured"] = f
            p["guardian_fail_count"] = fc

        data["guardian_failsafe_triggered_at"] = now
        data["guardian_failsafe_note"] = f"Mass deactivation prevented (active_after={active_after})."
        changed += 1

    active_final_before_removal = sum(1 for p in out if isinstance(p, dict) and bool(p.get("active")))

    if FORCE_RESTORE_ALL_IF_ZERO and active_final_before_removal == 0 and len(out) >= 1:
        boosted_all = _force_restore_all(out)
        print("========================================")
        print("FORCE-RESTORE FINAL (paraquedas):")
        print(f"Reativados (final): {boosted_all}/{len(out)}")
        print("========================================")
        changed += 1

    final_out: List[Dict[str, Any]] = []

    for p in out:
        if not isinstance(p, dict):
            continue

        sku = (p.get("sku") or "").strip()
        action = pending_actions.get(sku)
        approved_remove = False

        if action:
            disabled_event = action.get("disabled_event")
            remove_event = action.get("remove_event")
            remove_from_catalog = bool(action.get("remove_from_catalog"))

            if disabled_event and not bool(p.get("active")):
                if _append_removed_event(removed_history, disabled_event):
                    removed_events_added += 1

            if remove_from_catalog and not bool(p.get("active")):
                if remove_event and _append_removed_event(removed_history, remove_event):
                    removed_events_added += 1
                approved_remove = True
                removed_dead += 1
                changed += 1

        if approved_remove:
            continue

        final_out.append(p)

    data["products"] = final_out
    data["updated_at"] = now

    _write_json(PRODUTOS_JSON, data)
    _save_removed_reports(removed_history)
    _save_review_reports(review_history)

    print("========================================")
    print("Link Guardian finalizado.")
    print(f"Checked: {checked} | Max: {MAX_CHECK}")
    print(f"OK: {ok_count} | FAIL/DEAD: {dead_count} | TEMP: {temp_count}")
    print(f"STORE_INVALID: {store_invalid_count}")
    print(f"Removed corrupt: {removed_corrupt} | Removed dead: {removed_dead}")
    print(f"Removed events added: {removed_events_added}")
    print(f"Removed JSON: {REMOVED_JSON}")
    print(f"Removed TXT: {REMOVED_TXT}")
    print(f"Review JSON: {REVIEW_JSON}")
    print(f"Review TXT: {REVIEW_TXT}")
    print(f"Review items: {len(review_history.get('items') or [])}")
    print(f"Review items added: {review_items_added}")
    print(f"Review items removed: {review_items_removed}")
    print(f"Changed: {changed}")
    print(f"FAIL_THRESHOLD: {FAIL_THRESHOLD} | STOREFRONT_INVALID_THRESHOLD: {STOREFRONT_INVALID_THRESHOLD} | REMOVE_ON_DEAD: {int(REMOVE_ON_DEAD)} | CONSERVATIVE_ON_BLOCK: {int(CONSERVATIVE_ON_BLOCK)}")
    print(f"SOCIAL_INVALID_FOR_STOREFRONT: {int(SOCIAL_INVALID_FOR_STOREFRONT)} | LISTA_INVALID_FOR_STOREFRONT: {int(LISTA_INVALID_FOR_STOREFRONT)} | SOCIAL_COUNTS_AS_OK: {int(SOCIAL_COUNTS_AS_OK)} | STOREFRONT_REVIEW_ONLY: {int(STOREFRONT_REVIEW_ONLY)}")
    print(f"DEAD_ON_BODY: {int(DEAD_ON_BODY)} | MAX_CANDIDATE_URLS: {MAX_CANDIDATE_URLS} | REVIEW_THRESHOLD: {REVIEW_THRESHOLD}")
    print(f"SEARCH_OK_SCORE: {SEARCH_OK_SCORE} | SEARCH_REVIEW_SCORE: {SEARCH_REVIEW_SCORE} | TITLE_TOKEN_MIN_MATCH: {TITLE_TOKEN_MIN_MATCH}")
    print(f"RECOVER_ON_TEMP: {int(RECOVER_ON_TEMP)} | RECOVER_MAX_DAYS: {RECOVER_MAX_DAYS}")
    print(f"BOOTSTRAP_IF_ZERO: {int(BOOTSTRAP_IF_ZERO)} | BOOTSTRAP_MAX_DAYS: {BOOTSTRAP_MAX_DAYS}")
    print(f"FORCE_RESTORE_ALL_IF_ZERO: {int(FORCE_RESTORE_ALL_IF_ZERO)}")
    print(f"FAILSAFE_MIN_ACTIVE: {FAILSAFE_MIN_ACTIVE} | FAILSAFE_MIN_RATIO: {FAILSAFE_MIN_RATIO}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
