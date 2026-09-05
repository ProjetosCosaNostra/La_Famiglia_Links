"""Distribuidor multicanal BlackGold Beauty Finds.

Publica somente em canais explicitamente habilitados e com credenciais válidas.
Sem ``--live`` o comando apenas prepara/valida a distribuição, o que mantém o
gate de ativação seguro para GitHub Actions e testes.
"""

from __future__ import annotations

import argparse
import json
import os
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Tuple

GRAPH_VERSION = (os.getenv("META_GRAPH_VERSION") or "v26.0").strip()
GRAPH_BASE = f"https://graph.facebook.com/{GRAPH_VERSION}"
DEFAULT_SITE_BASE = "https://blackgold-beauty-finds-br.pages.dev"


def _read(path: Path, default: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def _write(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _env(name: str) -> str:
    return str(os.getenv(name) or "").strip()


def _absolute_image(value: str, site_base: str) -> str:
    image = str(value or "").strip()
    if image.startswith(("https://", "http://")):
        return image
    if not image:
        return ""
    return f"{site_base.rstrip('/')}/{image.lstrip('./')}"


def _tracked_url(site_base: str, sku: str, source: str, campaign_id: str) -> str:
    sku_part = urllib.parse.quote(str(sku or "").strip(), safe="")
    query = urllib.parse.urlencode({"src": source, "c": campaign_id})
    return f"{site_base.rstrip('/')}/go/{sku_part}?{query}"


def _caption(row: Dict[str, Any], tracked_url: str, *, instagram: bool = False) -> str:
    title = str(row.get("title") or "Achado BlackGold").strip()
    description = str(row.get("description") or "Achado selecionado pela curadoria BlackGold.").strip()
    category = str(row.get("category") or "Beleza").strip()
    price = str(row.get("price") or "Confira a oferta").strip()
    lines = [
        "👑 Seleção BlackGold",
        title,
        "",
        description,
        "",
        f"✨ {category}",
        f"💰 {price}",
        "",
    ]
    if instagram:
        lines.extend(["🛒 Produto e compra pelo endereço abaixo:", tracked_url])
    else:
        lines.extend(["🛒 Ver produto no Mercado Livre:", tracked_url])
    lines.extend(["", "Publicidade • link de afiliado Mercado Livre.", "#BlackGoldBeautyFinds #AchadoDoDia"])
    return "\n".join(lines)[:2100]


def _form_post(url: str, payload: Dict[str, str], timeout: int = 45) -> Dict[str, Any]:
    data = urllib.parse.urlencode(payload).encode("utf-8")
    request = urllib.request.Request(url, data=data, method="POST")
    with urllib.request.urlopen(request, timeout=timeout) as response:
        raw = response.read().decode("utf-8", errors="replace")
    return json.loads(raw or "{}")


def _json_get(url: str, timeout: int = 30) -> Dict[str, Any]:
    request = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        raw = response.read().decode("utf-8", errors="replace")
    return json.loads(raw or "{}")


def _telegram_call(token: str, method: str, payload: Dict[str, str]) -> Dict[str, Any]:
    return _form_post(f"https://api.telegram.org/bot{token}/{method}", payload)


def _publish_facebook(row: Dict[str, Any], *, site_base: str, campaign_id: str) -> str:
    token = _env("META_PAGE_ACCESS_TOKEN")
    page_id = _env("META_PAGE_ID")
    if not token or not page_id:
        raise RuntimeError("meta_facebook_not_configured")
    tracked = _tracked_url(site_base, str(row.get("sku") or ""), "facebook", campaign_id)
    image = _absolute_image(str(row.get("image") or ""), site_base)
    caption = _caption(row, tracked)
    if image:
        result = _form_post(
            f"{GRAPH_BASE}/{urllib.parse.quote(page_id, safe='')}/photos",
            {"url": image, "caption": caption, "access_token": token},
        )
    else:
        result = _form_post(
            f"{GRAPH_BASE}/{urllib.parse.quote(page_id, safe='')}/feed",
            {"message": caption, "link": tracked, "access_token": token},
        )
    remote_id = str(result.get("post_id") or result.get("id") or "").strip()
    if not remote_id:
        raise RuntimeError("meta_facebook_missing_remote_id")
    return remote_id


def _wait_instagram_container(container_id: str, token: str) -> None:
    encoded = urllib.parse.quote(container_id, safe="")
    for attempt in range(10):
        query = urllib.parse.urlencode({"fields": "status_code,status", "access_token": token})
        payload = _json_get(f"{GRAPH_BASE}/{encoded}?{query}")
        status = str(payload.get("status_code") or "").upper()
        if status in {"FINISHED", "PUBLISHED"}:
            return
        if status in {"ERROR", "EXPIRED"}:
            raise RuntimeError(f"instagram_container_{status.lower()}")
        if attempt < 9:
            time.sleep(2)
    raise RuntimeError("instagram_container_timeout")


def _publish_instagram(row: Dict[str, Any], *, site_base: str, campaign_id: str) -> str:
    token = _env("META_PAGE_ACCESS_TOKEN")
    ig_user_id = _env("META_IG_USER_ID")
    if not token or not ig_user_id:
        raise RuntimeError("meta_instagram_not_configured")
    image = _absolute_image(str(row.get("image") or ""), site_base)
    if not image:
        raise RuntimeError("instagram_requires_public_image")
    tracked = _tracked_url(site_base, str(row.get("sku") or ""), "instagram", campaign_id)
    caption = _caption(row, tracked, instagram=True)
    container = _form_post(
        f"{GRAPH_BASE}/{urllib.parse.quote(ig_user_id, safe='')}/media",
        {"image_url": image, "caption": caption, "access_token": token},
    )
    container_id = str(container.get("id") or "").strip()
    if not container_id:
        raise RuntimeError("instagram_missing_container_id")
    _wait_instagram_container(container_id, token)
    published = _form_post(
        f"{GRAPH_BASE}/{urllib.parse.quote(ig_user_id, safe='')}/media_publish",
        {"creation_id": container_id, "access_token": token},
    )
    remote_id = str(published.get("id") or "").strip()
    if not remote_id:
        raise RuntimeError("instagram_missing_media_id")
    return remote_id


def _publish_telegram(row: Dict[str, Any], *, site_base: str, campaign_id: str) -> str:
    if _env("ALLOW_TELEGRAM").lower() != "true":
        raise RuntimeError("telegram_policy_review_required")
    token = _env("TELEGRAM_BOT_TOKEN")
    chat_id = _env("TELEGRAM_CHAT_ID")
    if not token or not chat_id:
        raise RuntimeError("telegram_not_configured")
    tracked = _tracked_url(site_base, str(row.get("sku") or ""), "telegram", campaign_id)
    caption = _caption(row, tracked)
    image = _absolute_image(str(row.get("image") or ""), site_base)
    if image:
        result = _telegram_call(token, "sendPhoto", {"chat_id": chat_id, "photo": image, "caption": caption[:1024]})
    else:
        result = _telegram_call(token, "sendMessage", {"chat_id": chat_id, "text": caption})
    message = result.get("result") if isinstance(result, dict) else None
    remote_id = str(message.get("message_id") if isinstance(message, dict) else "").strip()
    if not remote_id:
        raise RuntimeError("telegram_missing_message_id")
    return remote_id


def _channel_registry() -> List[Tuple[str, bool, bool, str]]:
    return [
        (
            "facebook",
            bool(_env("META_PAGE_ACCESS_TOKEN") and _env("META_PAGE_ID")),
            True,
            "ALLOWED",
        ),
        (
            "instagram",
            bool(_env("META_PAGE_ACCESS_TOKEN") and _env("META_IG_USER_ID")),
            True,
            "ALLOWED",
        ),
        (
            "telegram",
            bool(_env("TELEGRAM_BOT_TOKEN") and _env("TELEGRAM_CHAT_ID")),
            _env("ALLOW_TELEGRAM").lower() == "true",
            "ALLOWED" if _env("ALLOW_TELEGRAM").lower() == "true" else "REVIEW_REQUIRED",
        ),
    ]


def _selected_channels(value: str) -> Iterable[str]:
    requested = {item.strip().lower() for item in value.split(",") if item.strip()}
    if not requested or "all" in requested:
        return ("facebook", "instagram", "telegram")
    return tuple(item for item in ("facebook", "instagram", "telegram") if item in requested)


def _publish_one(channel: str, row: Dict[str, Any], *, site_base: str, campaign_id: str) -> str:
    if channel == "facebook":
        return _publish_facebook(row, site_base=site_base, campaign_id=campaign_id)
    if channel == "instagram":
        return _publish_instagram(row, site_base=site_base, campaign_id=campaign_id)
    if channel == "telegram":
        return _publish_telegram(row, site_base=site_base, campaign_id=campaign_id)
    raise RuntimeError("unknown_channel")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--campaign", default="data/daily_selection.json")
    parser.add_argument("--state", default="data/multichannel_publish_state.json")
    parser.add_argument("--max-posts", type=int, default=1)
    parser.add_argument("--channels", default="all")
    parser.add_argument("--live", action="store_true", help="Autoriza publicação externa real nesta execução")
    args = parser.parse_args()

    site_base = _env("SITE_BASE") or DEFAULT_SITE_BASE
    campaign = _read(Path(args.campaign), {})
    campaign_id = str(campaign.get("campaign_id") or "").strip()
    rows = [row for row in campaign.get("selected", []) if isinstance(row, dict) and row.get("sku")]
    rows = rows[: max(1, min(int(args.max_posts), 3))]
    state_path = Path(args.state)
    state = _read(state_path, {"version": 2, "campaigns": {}, "channels": {}})
    if not isinstance(state, dict):
        state = {"version": 2, "campaigns": {}, "channels": {}}
    state.setdefault("campaigns", {})
    state.setdefault("channels", {})

    registry = {name: {"configured": configured, "policy_status": policy, "gate_open": gate} for name, configured, gate, policy in _channel_registry()}
    for name, info in registry.items():
        channel_state = state["channels"].setdefault(name, {})
        channel_state.update({
            "configured": bool(info["configured"]),
            "policy_status": info["policy_status"],
            "gate_open": bool(info["gate_open"]),
            "checked_at": _now(),
        })

    selected = tuple(_selected_channels(args.channels))
    if not campaign_id or not rows:
        state["updated_at"] = _now()
        _write(state_path, state)
        print("Distribuição multicanal: campanha vazia; nada para publicar.")
        return 0

    campaign_state = state["campaigns"].setdefault(campaign_id, {"channels": {}, "created_at": _now()})
    prepared: List[str] = []
    published: List[str] = []
    skipped: List[str] = []
    errors: List[str] = []

    for channel in selected:
        info = registry[channel]
        channel_campaign = campaign_state["channels"].setdefault(channel, {"published_skus": [], "remote_ids": []})
        already = set(str(value) for value in channel_campaign.get("published_skus", []) if value)
        channel_campaign["configured"] = bool(info["configured"])
        channel_campaign["policy_status"] = info["policy_status"]
        channel_campaign["updated_at"] = _now()

        if not info["gate_open"]:
            channel_campaign["status"] = "BLOCKED_BY_POLICY_GATE"
            skipped.append(channel)
            continue
        if not info["configured"]:
            channel_campaign["status"] = "PREPARED_NOT_CONFIGURED"
            prepared.append(channel)
            continue
        if not args.live:
            channel_campaign["status"] = "PREPARED"
            prepared.append(channel)
            continue

        channel_had_publish = False
        for row in rows:
            sku = str(row.get("sku") or "").strip()
            if not sku or sku in already:
                continue
            try:
                remote_id = _publish_one(channel, row, site_base=site_base, campaign_id=campaign_id)
                already.add(sku)
                channel_campaign.setdefault("remote_ids", []).append({"sku": sku, "id": remote_id, "published_at": _now()})
                channel_had_publish = True
            except Exception as exc:
                channel_campaign["status"] = "ERROR"
                channel_campaign["last_error"] = str(exc)[:300]
                channel_campaign["last_error_at"] = _now()
                errors.append(f"{channel}:{sku}")
                break

        channel_campaign["published_skus"] = sorted(already)
        if channel_had_publish and channel_campaign.get("status") != "ERROR":
            channel_campaign["status"] = "PUBLISHED"
            channel_campaign["last_success_at"] = _now()
            channel_campaign.pop("last_error", None)
            published.append(channel)
        elif not channel_had_publish and channel_campaign.get("status") != "ERROR":
            channel_campaign["status"] = "ALREADY_PUBLISHED"
            skipped.append(channel)

    state["version"] = 2
    state["updated_at"] = _now()
    state["last_campaign_id"] = campaign_id
    _write(state_path, state)
    print(
        "Distribuição multicanal: "
        f"live={'sim' if args.live else 'nao'}; "
        f"publicados={','.join(published) or '-'}; "
        f"preparados={','.join(prepared) or '-'}; "
        f"ignorados={','.join(skipped) or '-'}; "
        f"erros={','.join(errors) or '-'}"
    )
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
