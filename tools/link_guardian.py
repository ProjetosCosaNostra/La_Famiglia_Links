# ==========================================================
# Arquivo: tools/link_guardian.py
# Módulo : Link Guardian — Checa links e mantém vitrine só com produto vendável
# Versão : v4 (ANTI-WIPE + RECOVERY + BOOTSTRAP + detecta redirect /social/ + anti-bot 200 + fail-threshold)
#
# Regras:
#   - Vitrine só com produto vendável: se link realmente morrer => active=false (ou remove, se LG_REMOVE_ON_DEAD=1)
#   - Evitar falso-positivo: 403/429/5xx/timeouts/redirect SOCIAL => TEMP (não derruba)
#   - Só desativa depois de N falhas REAIS seguidas (LG_FAIL_THRESHOLD)
#   - FAILSAFE: se “quase tudo” cair num run, reverte (anti-wipe)
#   - RECOVERY: se cair em TEMP mas estava derrubado por wipe antigo, reativa via last_ok (LG_RECOVER_ON_TEMP=1)
#   - BOOTSTRAP: se a loja estiver zerada, reativa via last_ok recente antes de checar (LG_BOOTSTRAP_IF_ZERO=1)
#   - Produto do Dia (featured) NUNCA automático
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
from urllib.parse import urlparse


REPO_ROOT = Path(__file__).resolve().parents[1]
PRODUTOS_JSON = REPO_ROOT / "produtos.json"


# =========================
# CONFIG (env)
# =========================
DEFAULT_TIMEOUT = float(os.environ.get("LG_TIMEOUT_SEC", "12"))
SLEEP_BETWEEN = float(os.environ.get("LG_SLEEP_SEC", "0.35"))

MAX_CHECK = int(os.environ.get("LG_MAX_CHECK", "60"))

AUTO_REACTIVATE = os.environ.get("LG_AUTO_REACTIVATE", "0").strip() == "1"
CONSERVATIVE_ON_BLOCK = os.environ.get("LG_CONSERVATIVE_ON_BLOCK", "1").strip() == "1"

FAIL_THRESHOLD = int(os.environ.get("LG_FAIL_THRESHOLD", "2"))
REMOVE_ON_DEAD = os.environ.get("LG_REMOVE_ON_DEAD", "0").strip() == "1"
TREAT_5XX_TEMP = os.environ.get("LG_TREAT_5XX_TEMP", "1").strip() == "1"

# FAILSAFE anti-wipe (não deixa a loja zerar)
FAILSAFE_MIN_ACTIVE = int(os.environ.get("LG_FAILSAFE_MIN_ACTIVE", "10"))
FAILSAFE_MIN_RATIO = float(os.environ.get("LG_FAILSAFE_MIN_RATIO", "0.35"))

# RECOVERY: se estava derrubado e cair em TEMP (social/captcha), reativa usando last_ok recente
RECOVER_ON_TEMP = os.environ.get("LG_RECOVER_ON_TEMP", "1").strip() == "1"
RECOVER_MAX_DAYS = int(os.environ.get("LG_RECOVER_MAX_DAYS", "30"))

# BOOTSTRAP: se loja estiver zerada, reativa via last_ok recente antes de checar (corrige wipe antigo)
BOOTSTRAP_IF_ZERO = os.environ.get("LG_BOOTSTRAP_IF_ZERO", "1").strip() == "1"
BOOTSTRAP_MAX_DAYS = int(os.environ.get("LG_BOOTSTRAP_MAX_DAYS", "30"))


# =========================
# Mercado Livre host rules
# =========================
_ML_HOST_MARKERS = ("mercadolivre", "mercadolibre")
_ML_SHORT_HOSTS = {"meli.la", "meli.co"}


# =========================
# Heurística de indisponível (ML às vezes responde 200)
# =========================
_UNAVAILABLE_PATTERNS = [
    # PT-BR
    r"produto\s+indispon[ií]vel",
    r"an[uú]ncio\s+pausado",
    r"an[uú]ncio\s+(encerrado|finalizado|terminou)",
    r"publica[cç][aã]o\s+(encerrada|finalizada)",
    r"p[aá]gina\s+n[aã]o\s+encontrada",
    r"esta\s+p[aá]gina\s+n[aã]o\s+existe",
    r"n[aã]o\s+encontramos",
    r"error\s*404",

    # ES
    r"no\s+est[aá]\s+disponible",
    r"ya\s+no\s+est[aá]\s+disponible",
    r"publicaci[oó]n\s+finalizada",
    r"no\s+hay\s+publicaciones",
]
_UNAVAILABLE_RE = re.compile("|".join(f"(?:{p})" for p in _UNAVAILABLE_PATTERNS), re.IGNORECASE)

# Bloqueio/captcha/anti-bot (às vezes com 200)
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
        host = host.lstrip("www.")
        return host
    except Exception:
        return ""


def _path_of(u: str) -> str:
    try:
        pu = urlparse(u or "")
        return (pu.path or "").strip().lower()
    except Exception:
        return ""


def _is_social_path(u: str) -> bool:
    pth = _path_of(u)
    if not pth:
        return False
    return ("/social/" in pth) or pth.endswith("/lists")


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


def _pick_url(p: Dict[str, Any]) -> str:
    return _clean_url((p.get("check_url") or p.get("open_url") or "").strip())


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


def _is_block_or_social_redirect(status: int, final_url: str, body_sample: str) -> bool:
    # 403/429 já é bloqueio.
    if status in _BLOCK_STATUS:
        return True

    # /social/ ou /lists => NÃO é produto morto, é redirect/landing/anti-bot => TEMP
    if _is_social_path(final_url):
        return True

    # Se o HTML tiver sinais de captcha/anti-bot:
    text = (body_sample or "").lower()
    if text and _BLOCK_PAGE_RE.search(text):
        return True

    return False


def _is_definitely_dead(status: int, final_url: str, body_sample: str) -> bool:
    # Hard dead real
    if status in _HARD_DEAD_STATUS:
        return True

    text = (body_sample or "").lower()
    if not text:
        return False

    # Se for página de bloqueio/captcha, NUNCA tratar como dead
    if _BLOCK_PAGE_RE.search(text):
        return False

    # Se o destino cair em /social/, NUNCA tratar como dead (mesmo que tenha textos parecidos)
    if _is_social_path(final_url):
        return False

    # Indisponível real por padrões conhecidos
    if _UNAVAILABLE_RE.search(text):
        return True

    return False


def _check_url(url: str) -> CheckResult:
    u = _clean_url(url)
    if not u:
        return CheckResult(ok=False, temporary=False, status=0, final_url="", reason="sem_url")

    if not _is_ml_url(u):
        return CheckResult(ok=False, temporary=False, status=0, final_url=u, reason="nao_ml")

    status, final_url, sample = _fetch_status_and_sample(u)

    if status == 0:
        return CheckResult(ok=False, temporary=True, status=0, final_url=final_url or u, reason="sem_resposta")

    # bloqueio/redirect social/captcha => TEMP (não derruba, não conta falha)
    if CONSERVATIVE_ON_BLOCK and _is_block_or_social_redirect(status, final_url, sample):
        return CheckResult(ok=False, temporary=True, status=status, final_url=final_url or u, reason="bloqueio_ou_social")

    if TREAT_5XX_TEMP and status in _TEMP_STATUS:
        return CheckResult(ok=False, temporary=True, status=status, final_url=final_url or u, reason=f"temp_{status}")

    dead = _is_definitely_dead(status, final_url, sample)
    if dead:
        return CheckResult(ok=False, temporary=False, status=status, final_url=final_url or u, reason="dead")

    # Se não é dead e não é temp, consideramos OK conservador (não derruba por ruído).
    return CheckResult(ok=True, temporary=False, status=status, final_url=final_url or u, reason="ok")


def _sort_key(p: Dict[str, Any]) -> Tuple[int, int]:
    return (0 if bool(p.get("active")) else 1, 0 if bool(p.get("featured")) else 1)


def main() -> int:
    data = _read_json(PRODUTOS_JSON)
    products: List[Dict[str, Any]] = data.get("products") or []
    if not isinstance(products, list):
        products = []

    # remove corruptos
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

    # BOOTSTRAP: se a loja estiver zerada, reativa via last_ok recente (corrige wipe antigo)
    active_before_raw = sum(1 for p in products if isinstance(p, dict) and bool(p.get("active")))
    if BOOTSTRAP_IF_ZERO and active_before_raw == 0 and len(products) >= max(1, FAILSAFE_MIN_ACTIVE):
        boosted = 0
        for p in products:
            if not isinstance(p, dict):
                continue
            last_ok = (p.get("last_ok") or "").strip()
            if last_ok and _recent_enough(last_ok, BOOTSTRAP_MAX_DAYS):
                if not bool(p.get("active")):
                    p["active"] = True
                    # não mexe em featured
                    # zera fail_count pra recomeçar limpo
                    p["guardian_fail_count"] = 0
                    boosted += 1
        print("========================================")
        print("BOOTSTRAP ATIVADO (loja estava zerada):")
        print(f"Reativados via last_ok (<= {BOOTSTRAP_MAX_DAYS}d): {boosted}/{len(products)}")
        print("========================================")

    # snapshot pra FAILSAFE (APÓS bootstrap)
    orig: Dict[str, Tuple[bool, bool, int]] = {}
    for p in products:
        if isinstance(p, dict):
            sku = (p.get("sku") or "").strip()
            if sku:
                orig[sku] = (bool(p.get("active")), bool(p.get("featured")), int(p.get("guardian_fail_count") or 0))

    active_before = sum(1 for p in products if isinstance(p, dict) and bool(p.get("active")))

    now = _utc_now_iso_z()

    checked = 0
    changed = 0
    ok_count = 0
    dead_count = 0
    temp_count = 0
    removed_dead = 0

    products_sorted = sorted([p for p in products if isinstance(p, dict)], key=_sort_key)
    out: List[Dict[str, Any]] = []

    for p in products_sorted:
        if MAX_CHECK > 0 and checked >= MAX_CHECK:
            out.append(p)
            continue

        url = _pick_url(p)
        if not url:
            out.append(p)
            continue

        sku = (p.get("sku") or "").strip()
        was_active = bool(p.get("active"))
        was_featured = bool(p.get("featured"))

        res = _check_url(url)

        # auditoria
        p["guardian_last_checked"] = now
        p["guardian_last_status"] = int(res.status)
        p["guardian_last_final_url"] = _clean_url(res.final_url)
        p["guardian_last_reason"] = res.reason

        p["last_checked"] = now
        checked += 1

        # TEMP => não derruba e NÃO incrementa fail_count
        if res.temporary:
            temp_count += 1

            # RECOVERY: se estava inativo (wipe antigo) e temos last_ok recente, reativa
            if RECOVER_ON_TEMP and (not was_active):
                last_ok = (p.get("last_ok") or "").strip()
                if last_ok and _recent_enough(last_ok, RECOVER_MAX_DAYS):
                    p["active"] = True
                    p["guardian_fail_count"] = 0
                    changed += 1
                    print(f"[RECOVER/TEMP] {sku} -> REATIVADO via last_ok (status={res.status}, final={p.get('guardian_last_final_url','')})")
                else:
                    print(f"[TEMP] {sku} status={res.status} reason={res.reason} final={p.get('guardian_last_final_url','')}")
            else:
                print(f"[TEMP] {sku} status={res.status} reason={res.reason} final={p.get('guardian_last_final_url','')}")

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

            if AUTO_REACTIVATE and (not was_active):
                p["active"] = True
                changed += 1
                print(f"[OK] {sku} -> REATIVADO")
            else:
                print(f"[OK] {sku} status={res.status}")

            out.append(p)
            time.sleep(SLEEP_BETWEEN)
            continue

        # FAIL real (não-temp)
        dead_count += 1
        fail_count = int(p.get("guardian_fail_count") or 0) + 1
        p["guardian_fail_count"] = fail_count
        p["guardian_dead_status"] = int(res.status)
        p["guardian_dead_reason"] = res.reason

        if fail_count >= FAIL_THRESHOLD:
            if was_active:
                p["active"] = False
                changed += 1
            if was_featured:
                p["featured"] = False
                changed += 1
            p["guardian_disabled_at"] = now
            changed += 1

            print(f"[DEAD] {sku} status={res.status} -> DESATIVADO (fail={fail_count}/{FAIL_THRESHOLD})")

            if REMOVE_ON_DEAD:
                removed_dead += 1
                changed += 1
                time.sleep(SLEEP_BETWEEN)
                continue
        else:
            print(f"[FAIL] {sku} status={res.status} (fail={fail_count}/{FAIL_THRESHOLD})")

        out.append(p)
        time.sleep(SLEEP_BETWEEN)

    # FAILSAFE anti-wipe
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

    data["products"] = out
    data["updated_at"] = now

    _write_json(PRODUTOS_JSON, data)

    print("========================================")
    print("Link Guardian finalizado.")
    print(f"Checked: {checked} | Max: {MAX_CHECK}")
    print(f"OK: {ok_count} | FAIL/DEAD: {dead_count} | TEMP: {temp_count}")
    print(f"Removed corrupt: {removed_corrupt} | Removed dead: {removed_dead}")
    print(f"Changed: {changed}")
    print(f"FAIL_THRESHOLD: {FAIL_THRESHOLD} | REMOVE_ON_DEAD: {int(REMOVE_ON_DEAD)} | CONSERVATIVE_ON_BLOCK: {int(CONSERVATIVE_ON_BLOCK)}")
    print(f"RECOVER_ON_TEMP: {int(RECOVER_ON_TEMP)} | RECOVER_MAX_DAYS: {RECOVER_MAX_DAYS}")
    print(f"BOOTSTRAP_IF_ZERO: {int(BOOTSTRAP_IF_ZERO)} | BOOTSTRAP_MAX_DAYS: {BOOTSTRAP_MAX_DAYS}")
    print(f"FAILSAFE_MIN_ACTIVE: {FAILSAFE_MIN_ACTIVE} | FAILSAFE_MIN_RATIO: {FAILSAFE_MIN_RATIO}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
