# ==========================================================
# Arquivo: tools/link_guardian.py
# Módulo : Link Guardian — Checa links e desativa produtos quebrados (vendabilidade)
# Versão : v2 (fail-threshold + conservador anti-bloqueio + aceita meli.la + sem featured automático)
#
# Regras:
#   - Vitrine só com produto vendável: se link morrer => active=false (ou remove, se LG_REMOVE_ON_DEAD=1)
#   - Evitar falso-positivo: só desativa depois de N falhas seguidas (LG_FAIL_THRESHOLD, default=2)
#   - 403/429/5xx/timeouts => inconclusivo/temporário (não derruba)
#   - Produto do Dia (featured) NUNCA automático: se featured morrer, fica sem featured
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
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse


REPO_ROOT = Path(__file__).resolve().parents[1]
PRODUTOS_JSON = REPO_ROOT / "produtos.json"


# =========================
# CONFIG (env)
# =========================
DEFAULT_TIMEOUT = float(os.environ.get("LG_TIMEOUT_SEC", "12"))
SLEEP_BETWEEN = float(os.environ.get("LG_SLEEP_SEC", "0.25"))

# 0 = checa todos (cuidado com rate-limit); default mantém moderado
MAX_CHECK = int(os.environ.get("LG_MAX_CHECK", "80"))

# Só reativa automaticamente se você quiser (default OFF)
AUTO_REACTIVATE = os.environ.get("LG_AUTO_REACTIVATE", "0").strip() == "1"

# Conservador com bloqueios do ML (default ON)
CONSERVATIVE_ON_BLOCK = os.environ.get("LG_CONSERVATIVE_ON_BLOCK", "1").strip() == "1"

# Quantas falhas reais seguidas pra desativar (default 2)
FAIL_THRESHOLD = int(os.environ.get("LG_FAIL_THRESHOLD", "2"))

# Se quiser remover do JSON (irreversível), ligue (default OFF)
REMOVE_ON_DEAD = os.environ.get("LG_REMOVE_ON_DEAD", "0").strip() == "1"

# Se quiser tratar 5xx como temporário (default ON)
TREAT_5XX_TEMP = os.environ.get("LG_TREAT_5XX_TEMP", "1").strip() == "1"

# =========================
# Mercado Livre host rules
# =========================
_ML_HOST_MARKERS = ("mercadolivre", "mercadolibre")
_ML_SHORT_HOSTS = {"meli.la", "meli.co"}  # comuns
# também aceita meli.<tld> (ex: meli.la, meli.co, meli.xyz)


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


# Status fortes (morreu)
_HARD_DEAD_STATUS = {404, 410}

# Status que podem ser bloqueio/limit (não derrubar se conservador)
_BLOCK_STATUS = {403, 429}

# Status temporários (não derrubar)
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


def _is_ml_short(u: str) -> bool:
    host = _host_of(_clean_url(u).lower())
    if not host:
        return False
    if host in _ML_SHORT_HOSTS:
        return True
    if re.fullmatch(r"meli\.[a-z]{2,6}", host or ""):
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
    # check_url > open_url
    return _clean_url((p.get("check_url") or p.get("open_url") or "").strip())
def _make_request(url: str) -> urllib.request.Request:
    # Headers “browser-like” pra reduzir bloqueio do Mercado Livre
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
        # não baixa página inteira (leva / reduz chance de bloqueio)
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
    """
    Retorna (status_code, final_url, body_sample).
    body_sample é só um pedaço pequeno.
    """
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
            # HTTPError pode ter gzip? raramente, mas tenta
            sample = _decode_body(raw, is_gzip=False)
        except Exception:
            sample = ""
        return status, final_url, sample

    except urllib.error.URLError:
        return 0, url, ""


def _is_definitely_dead(status: int, body_sample: str) -> bool:
    """
    Decide se é *claramente* indisponível.
    - 404/410 => morto
    - 200/302 => procura sinais no HTML
    """
    if status in _HARD_DEAD_STATUS:
        return True

    text = (body_sample or "").lower()
    if not text:
        return False

    # heurística por conteúdo
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

    # sem resposta -> inconclusivo/temporário
    if status == 0:
        return CheckResult(ok=False, temporary=True, status=0, final_url=final_url or u, reason="sem_resposta")

    # bloqueio/rate limit -> inconclusivo se conservador
    if CONSERVATIVE_ON_BLOCK and status in _BLOCK_STATUS:
        return CheckResult(ok=False, temporary=True, status=status, final_url=final_url or u, reason=f"bloqueio_{status}")

    # 5xx/timeout -> temporário se habilitado
    if TREAT_5XX_TEMP and status in _TEMP_STATUS:
        return CheckResult(ok=False, temporary=True, status=status, final_url=final_url or u, reason=f"temp_{status}")

    dead = _is_definitely_dead(status, sample)

    if dead:
        return CheckResult(ok=False, temporary=False, status=status, final_url=final_url or u, reason="dead")

    # Se chegou aqui, consideramos OK
    return CheckResult(ok=True, temporary=False, status=status, final_url=final_url or u, reason="ok")
def _sort_key(p: Dict[str, Any]) -> Tuple[int, int]:
    # ativos primeiro, featured primeiro
    return (0 if bool(p.get("active")) else 1, 0 if bool(p.get("featured")) else 1)


def main() -> int:
    data = _read_json(PRODUTOS_JSON)
    products: List[Dict[str, Any]] = data.get("products") or []
    if not isinstance(products, list):
        products = []

    # remove itens claramente corrompidos (lixo)
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
    now = _utc_now_iso_z()

    checked = 0
    changed = 0
    ok_count = 0
    dead_count = 0
    temp_count = 0
    removed_dead = 0

    # checa prioritariamente ativos (e featured)
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

        # mantém compatibilidade com o site
        p["last_checked"] = now

        checked += 1

        # se for shortlink e o final caiu em /sec/, melhora check_url automaticamente (sem mexer no open_url)
        try:
            open_url = _clean_url(str(p.get("open_url") or ""))
            if open_url and _is_ml_short(open_url) and res.final_url and "/sec/" in res.final_url:
                if _clean_url(str(p.get("check_url") or "")) != _clean_url(res.final_url):
                    p["check_url"] = _clean_url(res.final_url)
                    p["resolved_url"] = _clean_url(res.final_url)
                    p["short_url"] = open_url
                    changed += 1
        except Exception:
            pass

        # temporário/inconclusivo -> não conta falha
        if res.temporary:
            temp_count += 1
            out.append(p)
            print(f"[TEMP] {sku} status={res.status} reason={res.reason}")
            time.sleep(SLEEP_BETWEEN)
            continue

        if res.ok:
            ok_count += 1
            p["last_ok"] = now
            # zera contador de falhas
            if int(p.get("guardian_fail_count") or 0) != 0:
                p["guardian_fail_count"] = 0
                changed += 1
            else:
                p["guardian_fail_count"] = 0

            # reativação opcional (default OFF)
            if AUTO_REACTIVATE and (not was_active):
                p["active"] = True
                changed += 1
                print(f"[OK] {sku} -> REATIVADO")
            else:
                print(f"[OK] {sku} status={res.status}")

            out.append(p)
            time.sleep(SLEEP_BETWEEN)
            continue

        # falha real: incrementa contador e só derruba quando atingir threshold
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

    # NÃO cria featured automático (regra do projeto)
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
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
