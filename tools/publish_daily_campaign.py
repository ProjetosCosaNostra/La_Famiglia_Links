"""Publica a campanha diaria BlackGold no Telegram com link afiliado direto."""

from __future__ import annotations

import argparse
import html
import json
import os
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List


def _read(path: Path, default: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def _write(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _absolute_image(value: str, site_base: str) -> str:
    image = str(value or "").strip()
    if image.startswith(("https://", "http://")):
        return image
    if not image or not site_base:
        return ""
    return f"{site_base.rstrip('/')}/{image.lstrip('./')}"


def _telegram_call(token: str, method: str, payload: Dict[str, str]) -> None:
    data = urllib.parse.urlencode(payload).encode("utf-8")
    request = urllib.request.Request(f"https://api.telegram.org/bot{token}/{method}", data=data)
    with urllib.request.urlopen(request, timeout=30) as response:
        response.read()


def _caption(row: Dict[str, Any], position: int, total: int) -> str:
    title = html.escape(str(row.get("title") or "Achado BlackGold"))
    category = html.escape(str(row.get("category") or "Beleza"))
    description = html.escape(str(row.get("description") or "Achado selecionado pela curadoria BlackGold."))
    price = html.escape(str(row.get("price") or "Confira a oferta"))
    link = html.escape(str(row.get("affiliate_url") or ""), quote=True)
    return (
        f"👑 <b>Seleção BlackGold {position}/{total}</b>\n"
        f"<b>{title}</b>\n\n"
        f"{description}\n\n"
        f"✨ {category}\n"
        f"💰 {price}\n\n"
        f"🛒 <a href=\"{link}\">Ver este produto no Mercado Livre</a>\n\n"
        "#BlackGoldBeautyFinds #AchadoDoDia"
    )


def publish(
    campaign: Dict[str, Any],
    state: Dict[str, Any],
    *,
    token: str,
    chat_id: str,
    site_base: str,
    max_posts: int,
    dry_run: bool = False,
) -> List[str]:
    campaign_id = str(campaign.get("campaign_id") or "").strip()
    already = set(str(value) for value in state.get("published_campaigns", []) if value)
    if not campaign_id or campaign_id in already:
        return []

    rows = [row for row in campaign.get("selected", []) if isinstance(row, dict) and row.get("affiliate_url")]
    rows = rows[: max(1, min(max_posts, 3))]
    published: List[str] = []

    for position, row in enumerate(rows, start=1):
        caption = _caption(row, position, len(rows))
        if not dry_run:
            image = _absolute_image(str(row.get("image") or ""), site_base)
            payload = {"chat_id": chat_id, "caption": caption[:1024], "parse_mode": "HTML"}
            if image:
                try:
                    _telegram_call(token, "sendPhoto", dict(payload, photo=image))
                except Exception:
                    _telegram_call(token, "sendMessage", {"chat_id": chat_id, "text": caption, "parse_mode": "HTML"})
            else:
                _telegram_call(token, "sendMessage", {"chat_id": chat_id, "text": caption, "parse_mode": "HTML"})
        published.append(str(row.get("sku") or ""))

    if published and not dry_run:
        already.add(campaign_id)
        state["updated_at"] = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
        state["last_campaign_id"] = campaign_id
        state["last_published_skus"] = published
        state["published_campaigns"] = sorted(already)[-90:]
    return published


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--campaign", default="data/daily_selection.json")
    parser.add_argument("--state", default="data/daily_publish_state.json")
    parser.add_argument("--max-posts", type=int, default=1)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    token = (os.getenv("TELEGRAM_BOT_TOKEN") or "").strip()
    chat_id = (os.getenv("TELEGRAM_CHAT_ID") or "").strip()
    site_base = (os.getenv("SITE_BASE") or "").strip()
    if not args.dry_run and (not token or not chat_id):
        print("Telegram nao configurado; campanha diaria gerada sem publicacao externa.")
        return 0

    campaign = _read(Path(args.campaign), {})
    state_path = Path(args.state)
    state = _read(state_path, {"version": 1, "published_campaigns": []})
    published = publish(
        campaign,
        state,
        token=token,
        chat_id=chat_id,
        site_base=site_base,
        max_posts=args.max_posts,
        dry_run=args.dry_run,
    )
    if published and not args.dry_run:
        _write(state_path, state)
    print(f"Publicacao diaria: {len(published)} produto(s) {'simulado(s)' if args.dry_run else 'enviado(s)' }.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
