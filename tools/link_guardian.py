# ==========================================================
# Arquivo: tools/link_guardian.py
# Módulo : Link Guardian — Checa links e desativa produtos quebrados
# Versão : v1 (stdlib-only + anti-block headers + throttle + fallback featured)
# ==========================================================

from __future__ import annotations

import json
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Tuple
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

REPO_ROOT = Path(__file__).resolve().parents[1]
PRODUTOS_JSON = REPO_ROOT / "produtos.json"


# =========================
# CONFIG (env)
# =========================
DEFAULT_TIMEOUT = float(os.environ.get("LG_TIMEOUT_SEC", "15"))
SLEEP_BETWEEN = float(os.environ.get("LG_SLEEP_SEC", "1.0"))
MAX_CHECK = int(os.environ.get("LG_MAX_CHECK", "60"))
AUTO_REACTIVATE = os.environ.get("LG_AUTO_REACTIVATE", "0").strip() == "1"

# Se quiser ser mais agressivo em desativar com 410/404/etc, deixa como está.
# Se quiser ser conservador, você pode tratar 403/429 como "inconclusivo".
CONSERVATIVE_ON_BLOCK = os.environ.get("LG_CONSERVATIVE_ON_BLOCK", "1").strip() == "1"


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
    return (p.get("check_url") or p.get("open_url") or "").strip()


def _make_request(url: str) -> Request:
    # Headers “browser-like” pra reduzir bloqueio do Mercado Livre
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/122.0.0.0 Safari/537.36"
        ),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
        "Connection": "close",
    }
    return Request(url, headers=headers, method="GET")


def _is_definitely_dead(status: int, body_sample: str) -> bool:
    """
    Decide se o link é *claramente* quebrado.
    Conservador: só marca dead em status bem claros ou texto de 404.
    """
    if status in (404, 410):
        return True

    # Alguns casos voltam 200 com página de "não encontrado"
    text = (body_sample or "").lower()

    dead_patterns = [
        r"p[aá]gina n[aã]o encontrada",
        r"n[aã]o encontramos",
        r"esta p[aá]gina n[aã]o existe",
        r"produto indispon[ií]vel",
        r"an[uú]ncio pausado",
        r"an[uú]ncio encerrado",
        r"an[uú]ncio finalizado",
        r"publica[cç][aã]o encerrada",
        r"ops[,!]\s*parece que esta p[aá]gina n[aã]o existe",
        r"error\s*404",
    ]

    for pat in dead_patterns:
        if re.search(pat, text):
            return True

    return False


def _fetch_status_and_sample(url: str) -> Tuple[int, str, str]:
    """
    Retorna (status_code, final_url, body_sample)
    body_sample é só um pedaço pequeno, pra não gastar banda.
    """
    req = _make_request(url)

    try:
        with urlopen(req, timeout=DEFAULT_TIMEOUT) as resp:
            status = getattr(resp, "status", 200)  # urllib em alguns casos não tem .status
            final_url = resp.geturl() or url
            raw = resp.read(50000)  # 50KB
            try:
                sample = raw.decode("utf-8", errors="ignore")
            except Exception:
                sample = ""
            return int(status), final_url, sample

    except HTTPError as e:
        status = int(getattr(e, "code", 0) or 0)
        final_url = getattr(e, "url", "") or url
        try:
            raw = e.read(50000)  # pode existir body mesmo em erro
            sample = raw.decode("utf-8", errors="ignore")
        except Exception:
            sample = ""
        return status, final_url, sample

    except URLError:
        return 0, url, ""


def _ensure_featured_fallback(products: List[Dict[str, Any]]) -> None:
    """
    Se não tiver nenhum featured ativo, escolhe o primeiro active=True como featured.
    """
    any_featured_active = any(bool(p.get("featured")) and bool(p.get("active")) for p in products if isinstance(p, dict))
    if any_featured_active:
        return

    # zera todos featured
    for p in products:
        if isinstance(p, dict):
            p["featured"] = False

    # escolhe o primeiro ativo
    for p in products:
        if not isinstance(p, dict):
            continue
        if bool(p.get("active")):
            p["featured"] = True
            return


def main() -> int:
    data = _read_json(PRODUTOS_JSON)
    products: List[Dict[str, Any]] = data.get("products") or []
    if not isinstance(products, list):
        products = []

    # Remove lixo antigo
    cleaned: List[Dict[str, Any]] = []
    removed = 0
    for p in products:
        if not isinstance(p, dict):
            removed += 1
            continue
        if _looks_corrupt_product(p):
            removed += 1
            continue
        cleaned.append(p)

    if removed:
        print(f"AVISO: removi {removed} item(ns) corrompido(s) do produtos.json.")

    products = cleaned

    now = _utc_now_iso_z()

    checked = 0
    changed = 0
    dead_count = 0
    ok_count = 0
    inconclusive_count = 0

    # Checa primeiro os ativos (pra ficar rápido e útil)
    # Depois, se sobrar espaço no MAX_CHECK, checa alguns inativos (somente para last_checked)
    def sort_key(p: Dict[str, Any]) -> Tuple[int, int]:
        # ativos primeiro, featured primeiro
        return (0 if p.get("active") else 1, 0 if p.get("featured") else 1)

    products_sorted = sorted([p for p in products if isinstance(p, dict)], key=sort_key)

    for p in products_sorted:
        if checked >= MAX_CHECK:
            break

        url = _pick_url(p)
        if not url:
            continue

        sku = (p.get("sku") or "").strip()
        was_active = bool(p.get("active"))
        was_featured = bool(p.get("featured"))

        status, final_url, sample = _fetch_status_and_sample(url)

        p["last_checked"] = now
        checked += 1

        # Tratamento conservador para bloqueios / rate limit
        if CONSERVATIVE_ON_BLOCK and status in (403, 429):
            inconclusive_count += 1
            print(f"[INCONCLUSIVO] {sku} status={status} (bloqueio/rate limit) url={url}")
            time.sleep(SLEEP_BETWEEN)
            continue

        # Falha de rede total (0) -> inconclusivo
        if status == 0:
            inconclusive_count += 1
            print(f"[INCONCLUSIVO] {sku} status=0 (network) url={url}")
            time.sleep(SLEEP_BETWEEN)
            continue

        dead = _is_definitely_dead(status, sample)

        if dead:
            dead_count += 1
            if was_active:
                p["active"] = False
                changed += 1
            if was_featured:
                p["featured"] = False
                changed += 1
            print(f"[DEAD] {sku} status={status} url={url} -> DESATIVADO")
        else:
            ok_count += 1
            # last_ok atualiza somente se ok
            p["last_ok"] = now

            # se você quiser reativar automaticamente quando voltar:
            if AUTO_REACTIVATE and (not was_active):
                p["active"] = True
                changed += 1
                print(f"[OK] {sku} status={status} -> REATIVADO")
            else:
                print(f"[OK] {sku} status={status}")

        time.sleep(SLEEP_BETWEEN)

    # Garante featured útil (se o featured morreu)
    _ensure_featured_fallback(products)

    data["products"] = products
    data["updated_at"] = now

    _write_json(PRODUTOS_JSON, data)

    print("========================================")
    print("Link Guardian finalizado.")
    print(f"Checked: {checked} / Max: {MAX_CHECK}")
    print(f"OK: {ok_count} | DEAD: {dead_count} | INCONCLUSIVO: {inconclusive_count}")
    print(f"Changed: {changed}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
