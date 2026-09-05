"""Funcionario digital BlackGold: escolhe a campanha diaria e aprende com cliques.

O motor usa um bandit simples e auditavel: desempenho real, exploracao de itens
menos exibidos, qualidade do cadastro, saude dos links e tempo desde a ultima
campanha. Nenhum servico de IA pago e necessario.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List

try:
    from tools.affiliate_links import affiliate_urls, choose_active_affiliate_url, normalize_affiliate_links
except ModuleNotFoundError:  # execucao direta
    from affiliate_links import affiliate_urls, choose_active_affiliate_url, normalize_affiliate_links


ALGORITHM_VERSION = "blackgold-bandit-v1"
BLOCKED_RE = re.compile(
    r"masculino|cueca|bermuda|automotiv|carro|moto|capacete|cachorro|\bpet\b|gato|cozinha|fog[aã]o|"
    r"panela|peneira|micro-ondas|fritadeira|cafeteira|geladeira|notebook|smartwatch|dashcam|roteador|"
    r"wi-?fi|televis|xbox|playstation|console|gamer|carregador|power\s*bank|c[aâ]mera|pneu|furadeira|"
    r"aspirador|mangueira|fralda|beb[eê]|air\s*fryer|alto-falante|speaker|headset|mouse|teclado|ssd",
    re.IGNORECASE,
)
BEAUTY_RE = re.compile(
    r"beleza|maqui|batom|gloss|perfume|col[oô]nia|c[ií]lio|sobrancelha|pele|facial|skincare|cabelo|"
    r"capilar|shampoo|condicionador|unha|esmalte|depil|hidrat|sabonete|protetor\s+solar|demaquil|"
    r"pincel|paleta|sombra|corretivo|r[ií]mel|m[aá]scara|s[eé]rum|creme|lo[cç][aã]o|escova\s+secadora|"
    r"modelador|babyliss|chapinha|secador|feminina|feminino|autocuidado",
    re.IGNORECASE,
)


def _read_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def _write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _products(payload: Any) -> List[Dict[str, Any]]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if isinstance(payload, dict):
        for key in ("products", "items", "produtos", "data"):
            if isinstance(payload.get(key), list):
                return [item for item in payload[key] if isinstance(item, dict)]
    return []


def _blob(product: Dict[str, Any]) -> str:
    values: List[str] = [
        str(product.get("title") or ""),
        str(product.get("categoria_principal") or ""),
        str(product.get("promo_text") or ""),
    ]
    for key in ("categorias_secundarias", "badges", "aliases_busca"):
        raw = product.get(key) or []
        values.extend(str(item) for item in (raw if isinstance(raw, list) else [raw]))
    return " ".join(values)


def is_beauty_product(product: Dict[str, Any]) -> bool:
    text = _blob(product)
    return bool(BEAUTY_RE.search(text)) and not bool(BLOCKED_RE.search(text))


def _category(product: Dict[str, Any]) -> str:
    text = _blob(product).casefold()
    if re.search(r"perfume|col[oô]nia|body splash|fragr", text):
        return "Perfumaria"
    if re.search(r"cabelo|capilar|shampoo|condicionador|secador|chapinha|modelador|escova", text):
        return "Cabelo"
    if re.search(r"pele|facial|skincare|hidrat|sabonete|protetor solar|s[eé]rum|demaquil", text):
        return "Skincare"
    if re.search(r"unha|esmalte|nail", text):
        return "Unhas"
    if re.search(r"batom|gloss|maqui|paleta|sombra|corretivo|r[ií]mel|c[ií]lio|pincel", text):
        return "Maquiagem"
    return "Beleza"


def _days_since(value: str, today: date) -> int:
    if not value:
        return 999
    try:
        parsed = date.fromisoformat(str(value)[:10])
        return max(0, (today - parsed).days)
    except Exception:
        return 999


def _deterministic_jitter(day: str, sku: str) -> float:
    digest = hashlib.sha256(f"{day}:{sku}".encode("utf-8")).digest()
    return int.from_bytes(digest[:2], "big") / 65535.0


def _stats_rows(payload: Any) -> Iterable[Dict[str, Any]]:
    if isinstance(payload, list):
        return [row for row in payload if isinstance(row, dict)]
    if isinstance(payload, dict):
        if isinstance(payload.get("products"), dict):
            return [dict(value, sku=key) for key, value in payload["products"].items() if isinstance(value, dict)]
        for key in ("rows", "stats", "items"):
            if isinstance(payload.get(key), list):
                return [row for row in payload[key] if isinstance(row, dict)]
    return []


def merge_observed_stats(learning: Dict[str, Any], stats: Any) -> None:
    memory = learning.setdefault("products", {})
    for row in _stats_rows(stats):
        sku = str(row.get("sku") or "").strip()
        if not sku:
            continue
        item = memory.setdefault(sku, {})
        for key in ("impressions", "clicks"):
            try:
                observed = max(0, int(row.get(key) or 0))
            except Exception:
                observed = 0
            item[key] = max(int(item.get(key) or 0), observed)


def score_product(product: Dict[str, Any], memory: Dict[str, Any], today: date, total_impressions: int) -> Dict[str, float]:
    sku = str(product.get("sku") or "")
    impressions = max(0, int(memory.get("impressions") or 0))
    clicks = max(0, int(memory.get("clicks") or 0))
    posterior_ctr = (clicks + 1.0) / (impressions + 20.0)
    exploration = math.sqrt(2.0 * math.log(total_impressions + 2.0) / (impressions + 1.0))
    days = _days_since(str(memory.get("last_selected") or ""), today)
    freshness = min(days, 21) / 21.0

    links = normalize_affiliate_links(product)
    healthy = sum(1 for entry in links if entry.get("status") == "healthy")
    quality = 0.0
    quality += 0.34 if str(product.get("card_image") or "").strip() else 0.0
    quality += 0.16 if str(product.get("promo_text") or "").strip() else 0.0
    quality += 0.08 if str(product.get("price_text") or "").strip() else 0.0
    quality += min(len(links), 5) * 0.035
    quality += healthy * 0.025
    quality += 0.08 if product.get("featured") is True else 0.0

    recent_penalty = 1.25 if days < 3 else (0.45 if days < 7 else 0.0)
    jitter = _deterministic_jitter(today.isoformat(), sku) * 0.08
    total = posterior_ctr * 7.0 + exploration * 0.52 + freshness * 1.15 + quality + jitter - recent_penalty
    return {
        "total": round(total, 6),
        "posterior_ctr": round(posterior_ctr, 6),
        "exploration": round(exploration, 6),
        "freshness": round(freshness, 6),
        "quality": round(quality, 6),
    }


def select_daily_products(
    products: List[Dict[str, Any]],
    learning: Dict[str, Any],
    today: date,
    count: int = 3,
) -> List[Dict[str, Any]]:
    memory = learning.setdefault("products", {})
    total_impressions = sum(max(0, int(item.get("impressions") or 0)) for item in memory.values() if isinstance(item, dict))
    candidates: List[Dict[str, Any]] = []

    for product in products:
        sku = str(product.get("sku") or "").strip()
        if not sku or product.get("active") is False or not is_beauty_product(product):
            continue
        # A nova identidade visual nunca reaproveita a arte promocional antiga.
        # O funcionario so publica depois que o bot de imagens aprovou a foto limpa.
        if not str(product.get("card_image") or "").strip():
            continue
        entries = normalize_affiliate_links(product)
        active_url = choose_active_affiliate_url(entries, str(product.get("active_affiliate_url") or product.get("open_url") or ""))
        if not active_url:
            continue
        item_memory = memory.setdefault(sku, {"impressions": 0, "clicks": 0, "selection_count": 0})
        parts = score_product(product, item_memory, today, total_impressions)
        candidates.append({"product": product, "url": active_url, "category": _category(product), "score": parts})

    candidates.sort(key=lambda row: (-row["score"]["total"], str(row["product"].get("sku") or "")))
    selected: List[Dict[str, Any]] = []
    used_categories = set()

    for prefer_diversity in (True, False):
        for row in candidates:
            sku = str(row["product"].get("sku") or "")
            if any(str(item["product"].get("sku") or "") == sku for item in selected):
                continue
            if prefer_diversity and row["category"] in used_categories:
                continue
            selected.append(row)
            used_categories.add(row["category"])
            if len(selected) >= count:
                return selected
    return selected


def build_campaign(selected: List[Dict[str, Any]], learning: Dict[str, Any], today: date) -> Dict[str, Any]:
    campaign_id = f"bg-{today.strftime('%Y%m%d')}"
    rows: List[Dict[str, Any]] = []
    memory = learning.setdefault("products", {})

    for position, row in enumerate(selected, start=1):
        product = row["product"]
        sku = str(product.get("sku") or "")
        item = memory.setdefault(sku, {"impressions": 0, "clicks": 0, "selection_count": 0})
        item["last_selected"] = today.isoformat()
        item["selection_count"] = int(item.get("selection_count") or 0) + 1
        item["last_score"] = row["score"]
        rows.append(
            {
                "position": position,
                "sku": sku,
                "title": str(product.get("title") or "BlackGold Beauty Find"),
                "category": row["category"],
                "description": str(product.get("promo_text") or product.get("descricao_curta") or "Achado selecionado pela curadoria BlackGold."),
                "price": str(product.get("price_text") or ""),
                "image": str(product.get("card_image") or product.get("image") or ""),
                "affiliate_url": row["url"],
                "score": row["score"],
            }
        )

    learning["version"] = 1
    learning["algorithm"] = ALGORITHM_VERSION
    learning["updated_at"] = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    learning["last_campaign_id"] = campaign_id
    return {
        "campaign_id": campaign_id,
        "date": today.isoformat(),
        "algorithm": ALGORITHM_VERSION,
        "selected": rows,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--catalog", default="produtos.json")
    parser.add_argument("--learning", default="data/campaign_learning.json")
    parser.add_argument("--stats", default="data/campaign_stats.json")
    parser.add_argument("--output", default="data/daily_selection.json")
    parser.add_argument("--count", type=int, default=3)
    parser.add_argument("--today", default="")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    today = date.fromisoformat(args.today) if args.today else datetime.now(timezone.utc).date()
    catalog = _products(_read_json(Path(args.catalog), {}))
    learning = _read_json(Path(args.learning), {"version": 1, "products": {}})
    if not isinstance(learning, dict):
        learning = {"version": 1, "products": {}}
    merge_observed_stats(learning, _read_json(Path(args.stats), {}))
    selected = select_daily_products(catalog, learning, today, max(1, min(int(args.count), 12)))
    campaign = build_campaign(selected, learning, today)
    _write_json(Path(args.output), campaign)
    _write_json(Path(args.learning), learning)
    print(f"Campanha {campaign['campaign_id']}: {len(campaign['selected'])} produto(s) selecionado(s).")
    for row in campaign["selected"]:
        print(f"#{row['position']} {row['sku']} score={row['score']['total']}")
    if not selected:
        print("Campanha aguardando fotos limpas aprovadas; nenhuma arte antiga sera publicada.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
