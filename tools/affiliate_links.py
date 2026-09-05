"""Contrato compartilhado para os links afiliados BlackGold.

Cada produto pode manter ate cinco links do mesmo item. O primeiro link valido
e usado na loja e nas campanhas; os demais ficam como redundancia operacional.
Este modulo nao faz requisicoes de rede. Ele apenas normaliza e escolhe links.
"""

from __future__ import annotations

from copy import deepcopy
from typing import Any, Dict, Iterable, List


MAX_AFFILIATE_LINKS = 5
HEALTHY_STATES = {"healthy", "ok"}
USABLE_STATES = HEALTHY_STATES | {"unknown", "temporary", "suspect"}


def clean_url(value: Any) -> str:
    url = str(value or "").strip()
    while url and url[0] in {"'", '"', " "}:
        url = url[1:]
    while url and url[-1] in {'"', "'", ")", "]", ">", "\\", " ", "\t", "\r", "\n"}:
        url = url[:-1]
    return url.strip()


def _entry_from(value: Any, priority: int) -> Dict[str, Any] | None:
    if isinstance(value, str):
        url = clean_url(value)
        source: Dict[str, Any] = {}
    elif isinstance(value, dict):
        source = deepcopy(value)
        url = clean_url(source.get("url") or source.get("href") or source.get("link"))
    else:
        return None

    if not url:
        return None

    try:
        fail_count = max(0, int(source.get("fail_count") or 0))
    except Exception:
        fail_count = 0

    try:
        last_status = max(0, int(source.get("last_status") or 0))
    except Exception:
        last_status = 0

    status = str(source.get("status") or "unknown").strip().lower()
    if status not in {"unknown", "healthy", "temporary", "suspect", "dead"}:
        status = "unknown"

    return {
        "url": url,
        "priority": priority,
        "status": status,
        "fail_count": fail_count,
        "last_checked": str(source.get("last_checked") or "").strip(),
        "last_ok": str(source.get("last_ok") or "").strip(),
        "last_status": last_status,
        "last_final_url": clean_url(source.get("last_final_url") or ""),
        "last_reason": str(source.get("last_reason") or "").strip(),
    }


def normalize_affiliate_links(
    product: Dict[str, Any],
    explicit_urls: Iterable[Any] | None = None,
    *,
    include_legacy: bool = True,
    limit: int = MAX_AFFILIATE_LINKS,
) -> List[Dict[str, Any]]:
    """Retorna uma lista deduplicada e ordenada, preservando a saude existente."""

    raw: List[Any] = []
    if explicit_urls is not None:
        raw.extend(list(explicit_urls))
    else:
        current = product.get("affiliate_links") or []
        if isinstance(current, list):
            raw.extend(current)

    if include_legacy:
        raw.extend(
            [
                product.get("active_affiliate_url"),
                product.get("open_url"),
                product.get("alt_url"),
            ]
        )

    out: List[Dict[str, Any]] = []
    seen = set()
    for value in raw:
        entry = _entry_from(value, len(out) + 1)
        if not entry:
            continue
        key = entry["url"].casefold()
        if key in seen:
            continue
        seen.add(key)
        out.append(entry)
        if limit > 0 and len(out) >= limit:
            break

    for index, entry in enumerate(out, start=1):
        entry["priority"] = index
    return out


def affiliate_urls(product: Dict[str, Any]) -> List[str]:
    return [entry["url"] for entry in normalize_affiliate_links(product)]


def choose_active_affiliate_url(entries: List[Dict[str, Any]], current: str = "") -> str:
    """Mantem o atual se saudavel; senao escolhe o melhor fallback utilizavel."""

    current_clean = clean_url(current)
    if current_clean:
        for entry in entries:
            if entry.get("url") == current_clean and entry.get("status") in HEALTHY_STATES:
                return current_clean

    for allowed in (HEALTHY_STATES, USABLE_STATES):
        for entry in entries:
            if str(entry.get("status") or "unknown") in allowed:
                return clean_url(entry.get("url"))

    return current_clean or (clean_url(entries[0].get("url")) if entries else "")


def apply_affiliate_contract(product: Dict[str, Any], explicit_urls: Iterable[Any] | None = None) -> bool:
    """Materializa o contrato v2 sem remover campos legados necessarios ao site."""

    entries = normalize_affiliate_links(product, explicit_urls)
    before_entries = product.get("affiliate_links")
    before_active = clean_url(product.get("active_affiliate_url") or "")
    active = choose_active_affiliate_url(entries, before_active or clean_url(product.get("open_url")))

    product["affiliate_links"] = entries
    product["active_affiliate_url"] = active
    if active:
        product["open_url"] = active
    product["affiliate_healthy_count"] = sum(
        1 for entry in entries if str(entry.get("status") or "") in HEALTHY_STATES
    )

    return before_entries != entries or before_active != active
