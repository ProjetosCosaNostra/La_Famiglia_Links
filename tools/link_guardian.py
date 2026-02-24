# ==========================================================
# Arquivo: tools/link_guardian.py
# Módulo : Link Guardian — Checa links e mantém vitrine só com produto vendável
# Versão : v3 (failsafe anti-wipe + multi-candidates + anti-captcha 200 + restore opcional)
#
# Objetivo:
#   - Vitrine só com produto vendável: se link realmente morrer => active=false (ou remove, se LG_REMOVE_ON_DEAD=1)
#   - Evitar falso-positivo (bloqueio/captcha/rate limit): nunca derrubar por "TEMP" ou por wipe em massa
#   - Checagem robusta: tenta várias URLs do mesmo produto (open/check/resolved/canonical/short)
#   - Produto do Dia (featured) NUNCA automático
#
# Regras práticas (recomendado):
#   - Deixe CONSERVATIVE_ON_BLOCK=1 (default)
#   - FAIL_THRESHOLD >= 2 (default=2)
#   - FAILSAFE_MIN_ACTIVE e FAILSAFE_MIN_RATIO ligados (default)
#   - Se a loja zerar de novo: rode uma vez com LG_RESTORE_DISABLED=1
# ==========================================================

from __future__ import annotations

import gzip
import json
import math
import os
import re
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple
from urllib.parse import urlparse


REPO_ROOT = Path(__file__).resolve().parents[1]
PRODUTOS_JSON = REPO_ROOT / "produtos.json"


# =========================
# CONFIG (env)
# =========================
DEFAULT_TIMEOUT = float(os.environ.get("LG_TIMEOUT_SEC", "12"))
SLEEP_BETWEEN = float(os.environ.get("LG_SLEEP_SEC", "0.35"))

# 0 = checa todos (cuidado com rate-limit); default mantém moderado
MAX_CHECK = int(os.environ.get("LG_MAX_CHECK", "60"))

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

# FAILSAFE anti-wipe:
# se depois do run o número de ativos cair abaixo do mínimo/ratio, desfaz as desativações deste run.
FAILSAFE_MIN_ACTIVE = int(os.environ.get("LG_FAILSAFE_MIN_ACTIVE", "10"))
FAILSAFE_MIN_RATIO = float(os.environ.get("LG_FAILSAFE_MIN_RATIO", "0.35"))

# RESTORE opcional (emergência):
# - se LG_RESTORE_DISABLED=1: reativa produtos desativados pelo Guardian nas últimas N horas,
#   zera contador de falhas e deixa o Guardian conferir de novo.
RESTORE_DISABLED = os.environ.get("LG_RESTORE_DISABLED", "0").strip() == "1"
RESTORE_DISABLED_HOURS = float(os.environ.get("LG_RESTORE_DISABLED_HOURS", "72"))


# =========================
# Mercado Livre host rules
# =========================
_ML_HOST_MARKERS = ("mercadolivre", "mercadolibre")
_ML_SHORT_HOSTS = {"meli.la", "meli.co"}  # comuns
# também aceita meli.<tld> (ex: meli.la, meli.co, meli.xyz)


# =========================
# Heurística de indisponível / bloqueio (ML às vezes responde 200)
# =========================
_UNAVAILABLE_PATTERNS = [
    # PT-BR (indisponível real)
    r"produto\s+indispon[ií]vel",
    r"an[uú]ncio\s+pausado",
    r"an[uú]ncio\s+(encerrado|finalizado|terminou)",
    r"publica[cç][aã]o\s+(encerrada|finalizada)",
    r"p[aá]gina\s+n[aã]o\s+encontrada",
    r"esta\s+p[aá]gina\s+n[aã]o\s+existe",
    r"error\s*404",
    r"ops[,!]\s*parece\s+que\s+esta\s+p[aá]gina\s+n[aã]o\s+existe",

    # ES (indisponível real)
    r"no\s+est[aá]\s+disponible",
    r"ya\s+no\s+est[aá]\s+disponible",
    r"publicaci[oó]n\s+finalizada",
]
_UNAVAILABLE_RE = re.compile("|".join(f"(?:{p})" for p in _UNAVAILABLE_PATTERNS), re.IGNORECASE)

# Bloqueio/captcha/anti-bot (muitas vezes 200)
_BLOCK_PAGE_PATTERNS = [
    r"captcha",
    r"recaptcha",
    r"cloudflare",
    r"attention\s+required",
    r"access\s+denied",
    r"unusual\s+traffic",
    r"detected\s+unusual",
    r"verify\s+you\s+are\s+human",
    r"are\s+you\s+a\s+robot",
    r"não\s+somos\s+um\s+rob[oô]",
    r"verifique\s+se\s+voc[eê]\s+é\s+humano",
    r"tr[aá]fego\s+incomum",
    r"bloquead[oa]",
    r"requisi[cç][aã]o\s+inv[aá]lida",
    r"erro\s+de\s+seguran[cç]a",
    r"sistema\s+de\s+seguran[cç]a",
]
_BLOCK_PAGE_RE = re.compile("|".join(f"(?:{p})" for p in _BLOCK_PAGE_PATTERNS), re.IGNORECASE)

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
    checked_url: str


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
        # não baixa página inteira (leve)
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
        # se falhar, tenta decodificar como veio
        pass

    try:
        return raw.decode("utf-8", errors="ignore")
    except Exception:
        try:
            return raw.decode("latin-1", errors="ignore")
        except Exception:
            return ""


def _fetch_status_and_sample(url: str) -> Tuple[int, str, str, bool]:
    """
    Retorna (status_code, final_url, body_sample, is_html_like).
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

            ctype = (resp.headers.get("Content-Type") or "").lower()
            is_html = ("text/html" in ctype) or ("application/xhtml" in ctype) or ("<html" in (sample[:500].lower() if sample else ""))
            return status, final_url, sample, bool(is_html)

    except urllib.error.HTTPError as e:
        status = int(getattr(e, "code", 0) or 0)
        final_url = _clean_url(getattr(e, "url", "") or url)
        try:
            raw = e.read() or b""
            sample = _decode_body(raw, is_gzip=False)
        except Exception:
            sample = ""
        # em erro, assume HTML possível
        return status, final_url, sample, True

    except urllib.error.URLError:
        return 0, url, "", False


def _is_block_page(status: int, body_sample: str) -> bool:
    # status de bloqueio, ou HTML com sinais de captcha/anti-bot
    if status in _BLOCK_STATUS:
        return True
    text = (body_sample or "").lower()
    if not text:
        return False
    return bool(_BLOCK_PAGE_RE.search(text))


def _is_definitely_dead(status: int, body_sample: str) -> bool:
    """
    Decide se é *claramente* indisponível.
    - 404/410 => morto
    - 200/302 => procura sinais no HTML (mas cuidado com captcha: isso é tratado antes)
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
        return CheckResult(ok=False, temporary=False, status=0, final_url="", reason="sem_url", checked_url="")

    if not _is_ml_url(u):
        return CheckResult(ok=False, temporary=False, status=0, final_url=u, reason="nao_ml", checked_url=u)

    status, final_url, sample, _is_html = _fetch_status_and_sample(u)

    # sem resposta -> inconclusivo/temporário
    if status == 0:
        return CheckResult(ok=False, temporary=True, status=0, final_url=final_url or u, reason="sem_resposta", checked_url=u)

    # bloqueio/captcha -> temporário (mesmo que venha 200)
    if CONSERVATIVE_ON_BLOCK and _is_block_page(status, sample):
        return CheckResult(ok=False, temporary=True, status=status, final_url=final_url or u, reason=f"bloqueio_{status or 200}", checked_url=u)

    # 5xx/timeout -> temporário se habilitado
    if TREAT_5XX_TEMP and status in _TEMP_STATUS:
        return CheckResult(ok=False, temporary=True, status=status, final_url=final_url or u, reason=f"temp_{status}", checked_url=u)

    dead = _is_definitely_dead(status, sample)
    if dead:
        return CheckResult(ok=False, temporary=False, status=status, final_url=final_url or u, reason="dead", checked_url=u)

    # Se chegou aqui, consideramos OK
    return CheckResult(ok=True, temporary=False, status=status, final_url=final_url or u, reason="ok", checked_url=u)


def _unique_keep_order(items: Iterable[str]) -> List[str]:
    out: List[str] = []
    seen = set()
    for it in items:
        x = _clean_url(it)
        if not x:
            continue
        key = x.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(x)
    return out


def _url_is_sec(url: str) -> bool:
    return "/sec/" in (url or "").lower()


def _collect_candidate_urls(p: Dict[str, Any]) -> List[str]:
    """
    Ordem de checagem (mais confiável primeiro):
      1) open_url com /sec/
      2) check_url com /sec/
      3) resolved_url com /sec/
      4) open_url
      5) check_url
      6) resolved_url
      7) canonical_url (geralmente lista/ busca - menos confiável)
      8) short_url
    """
    open_url = _clean_url(str(p.get("open_url") or ""))
    check_url = _clean_url(str(p.get("check_url") or ""))
    resolved_url = _clean_url(str(p.get("resolved_url") or ""))
    canonical_url = _clean_url(str(p.get("canonical_url") or ""))
    short_url = _clean_url(str(p.get("short_url") or ""))

    cands: List[str] = []

    if open_url and _url_is_sec(open_url):
        cands.append(open_url)
    if check_url and _url_is_sec(check_url):
        cands.append(check_url)
    if resolved_url and _url_is_sec(resolved_url):
        cands.append(resolved_url)

    if open_url:
        cands.append(open_url)
    if check_url:
        cands.append(check_url)
    if resolved_url:
        cands.append(resolved_url)
    if canonical_url:
        cands.append(canonical_url)
    if short_url:
        cands.append(short_url)

    # filtra só URLs ML válidas (mantém ordem)
    cands = [u for u in _unique_keep_order(cands) if _is_ml_url(u)]
    return cands


def _check_product(p: Dict[str, Any]) -> Tuple[CheckResult, List[CheckResult]]:
    """
    Tenta múltiplas URLs do mesmo produto.
    Retorna: (melhor_resultado, resultados_por_candidato)
      - Se algum OK -> retorna esse OK
      - Se nenhum OK mas teve TEMP -> retorna TEMP
      - Se todos DEAD -> retorna DEAD
    """
    candidates = _collect_candidate_urls(p)
    results: List[CheckResult] = []
    any_temp = False

    for u in candidates:
        res = _check_url(u)
        results.append(res)

        if res.ok:
            return res, results
        if res.temporary:
            any_temp = True

    # nenhum OK
    if any_temp:
        # pega o último temp (mais recente) para log/status
        last_temp = next((r for r in reversed(results) if r.temporary), None)
        if last_temp:
            return last_temp, results
        # fallback
        return CheckResult(ok=False, temporary=True, status=0, final_url="", reason="temp", checked_url=""), results

    # sem temp: considera dead (se não tiver candidato, marca sem_url)
    if results:
        # pega o último dead
        last = results[-1]
        return last, results

    return CheckResult(ok=False, temporary=False, status=0, final_url="", reason="sem_url", checked_url=""), results


def _parse_iso_z(s: str) -> Optional[datetime]:
    try:
        if not s:
            return None
        x = str(s).strip()
        if x.endswith("Z"):
            x = x.replace("Z", "+00:00")
        return datetime.fromisoformat(x)
    except Exception:
        return None


def _maybe_restore_disabled(products: List[Dict[str, Any]], now_iso: str) -> int:
    """
    Restaura produtos desativados pelo Guardian recentemente.
    Retorna quantidade restaurada.
    """
    if not RESTORE_DISABLED:
        return 0

    now_dt = _parse_iso_z(now_iso) or datetime.now(timezone.utc)
    restored = 0

    for p in products:
        if not isinstance(p, dict):
            continue
        disabled_at = _parse_iso_z(str(p.get("guardian_disabled_at") or ""))
        if not disabled_at:
            continue

        age_hours = (now_dt - disabled_at).total_seconds() / 3600.0
        if age_hours > RESTORE_DISABLED_HOURS:
            continue

        # restaura
        if p.get("active") is False:
            p["active"] = True
        # featured não reativa automático; mantém o que está
        p["guardian_fail_count"] = 0
        p["guardian_restored_at"] = now_iso
        restored += 1

    return restored


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

    # snapshot flags (pra failsafe anti-wipe)
    orig_flags: Dict[str, Tuple[bool, bool, int]] = {}
    for p in products:
        if not isinstance(p, dict):
            continue
        sku = str(p.get("sku") or "").strip()
        if not sku:
            continue
        orig_flags[sku] = (bool(p.get("active")), bool(p.get("featured")), int(p.get("guardian_fail_count") or 0))

    active_before = sum(1 for p in products if isinstance(p, dict) and bool(p.get("active")))
    total_before = len([p for p in products if isinstance(p, dict)])

    restored = _maybe_restore_disabled(products, now)
    if restored:
        print(f"RESTORE: reativei {restored} produto(s) desativado(s) recentemente pelo Guardian.")

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

        sku = (p.get("sku") or "").strip()

        # auditoria baseline
        p["guardian_last_checked"] = now

        # escolhe e checa
        best, results = _check_product(p)
        checked += 1

        # auditoria do melhor
        p["guardian_last_status"] = int(best.status)
        p["guardian_last_final_url"] = _clean_url(best.final_url)
        p["guardian_last_reason"] = best.reason
        p["guardian_last_checked_url"] = _clean_url(best.checked_url)

        # compatibilidade com site
        p["last_checked"] = now

        # se algum candidato OK e final caiu em /sec/, melhora check_url automaticamente (sem mexer no open_url)
        if best.ok and best.final_url and _url_is_sec(best.final_url):
            try:
                cur_check = _clean_url(str(p.get("check_url") or ""))
                if cur_check != _clean_url(best.final_url):
                    p["check_url"] = _clean_url(best.final_url)
                    p["resolved_url"] = _clean_url(best.final_url)
                    # se open_url era short, guarda
                    open_url = _clean_url(str(p.get("open_url") or ""))
                    if open_url and _is_ml_short(open_url):
                        p["short_url"] = open_url
                    changed += 1
            except Exception:
                pass

        # temporário/inconclusivo -> não conta falha e não derruba
        if best.temporary:
            temp_count += 1
            out.append(p)
            print(f"[TEMP] {sku} status={best.status} reason={best.reason}")
            time.sleep(SLEEP_BETWEEN)
            continue

        was_active = bool(p.get("active"))
        was_featured = bool(p.get("featured"))

        if best.ok:
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
                print(f"[OK] {sku} status={best.status}")

            out.append(p)
            time.sleep(SLEEP_BETWEEN)
            continue

        # falha real: incrementa contador e só derruba quando atingir threshold
        dead_count += 1
        fail_count = int(p.get("guardian_fail_count") or 0) + 1
        p["guardian_fail_count"] = fail_count
        p["guardian_dead_status"] = int(best.status)
        p["guardian_dead_reason"] = best.reason

        if fail_count >= FAIL_THRESHOLD:
            if was_active:
                p["active"] = False
                changed += 1
            if was_featured:
                p["featured"] = False
                changed += 1
            p["guardian_disabled_at"] = now
            changed += 1

            print(f"[DEAD] {sku} status={best.status} -> DESATIVADO (fail={fail_count}/{FAIL_THRESHOLD})")

            if REMOVE_ON_DEAD:
                removed_dead += 1
                changed += 1
                time.sleep(SLEEP_BETWEEN)
                continue
        else:
            print(f"[FAIL] {sku} status={best.status} (fail={fail_count}/{FAIL_THRESHOLD})")

        out.append(p)
        time.sleep(SLEEP_BETWEEN)

    # ===== FAILSAFE ANTI-WIPE =====
    active_after = sum(1 for p in out if isinstance(p, dict) and bool(p.get("active")))
    min_allowed = max(
        FAILSAFE_MIN_ACTIVE,
        int(math.ceil(active_before * FAILSAFE_MIN_RATIO)) if active_before > 0 else 0,
    )

    failsafe_trigger = False
    if active_before > 0 and active_after < min_allowed:
        failsafe_trigger = True

    if failsafe_trigger:
        print("========================================")
        print("FAILSAFE TRIGGERED (anti-wipe):")
        print(f"Active before: {active_before} | Active after: {active_after} | Min allowed: {min_allowed}")
        print("=> Revertendo mudanças de active/featured deste run para evitar loja zerada por falso-positivo.")

        for p in out:
            if not isinstance(p, dict):
                continue
            sku = str(p.get("sku") or "").strip()
            if not sku:
                continue
            if sku not in orig_flags:
                continue
            orig_active, orig_featured, orig_fail = orig_flags[sku]
            if bool(p.get("active")) != orig_active:
                p["active"] = orig_active
            if bool(p.get("featured")) != orig_featured:
                p["featured"] = orig_featured
            # não escala fail_count em wipe (evita escalar falso-positivo)
            p["guardian_fail_count"] = orig_fail

        data["guardian_failsafe_triggered_at"] = now
        data["guardian_failsafe_note"] = f"Reverted active/featured due to mass deactivation (active_after={active_after})."
        changed += 1

    # Produto do Dia (featured) NUNCA automático (regra)
    data["products"] = out
    data["updated_at"] = now

    _write_json(PRODUTOS_JSON, data)

    print("========================================")
    print("Link Guardian finalizado.")
    print(f"Total products: {total_before}")
    print(f"Active before: {active_before} | Active after: {sum(1 for p in out if isinstance(p, dict) and bool(p.get('active')))}")
    print(f"Checked: {checked} | Max: {MAX_CHECK}")
    print(f"OK: {ok_count} | FAIL/DEAD: {dead_count} | TEMP: {temp_count}")
    print(f"Removed corrupt: {removed_corrupt} | Removed dead: {removed_dead}")
    print(f"Restored recently disabled: {restored}")
    print(f"Changed: {changed}")
    print(f"FAIL_THRESHOLD: {FAIL_THRESHOLD} | REMOVE_ON_DEAD: {int(REMOVE_ON_DEAD)} | CONSERVATIVE_ON_BLOCK: {int(CONSERVATIVE_ON_BLOCK)}")
    print(f"FAILSAFE_MIN_ACTIVE: {FAILSAFE_MIN_ACTIVE} | FAILSAFE_MIN_RATIO: {FAILSAFE_MIN_RATIO}")
    print(f"RESTORE_DISABLED: {int(RESTORE_DISABLED)} | RESTORE_DISABLED_HOURS: {RESTORE_DISABLED_HOURS}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
