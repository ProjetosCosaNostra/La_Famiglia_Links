"""Migra o catalogo legado para o contrato de ate cinco links afiliados."""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

try:
    from tools.affiliate_links import apply_affiliate_contract
except ModuleNotFoundError:  # execucao direta
    from affiliate_links import apply_affiliate_contract


def _products(payload: Any) -> List[Dict[str, Any]]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if isinstance(payload, dict):
        for key in ("products", "items", "produtos", "data"):
            if isinstance(payload.get(key), list):
                return [item for item in payload[key] if isinstance(item, dict)]
    return []


def migrate(payload: Any) -> int:
    changed = 0
    for product in _products(payload):
        if apply_affiliate_contract(product):
            changed += 1
    if isinstance(payload, dict) and changed:
        payload["catalog_schema_version"] = 2
        payload["updated_at"] = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    return changed


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default="produtos.json")
    parser.add_argument("--out", default="produtos.json")
    args = parser.parse_args()

    source = Path(args.input)
    destination = Path(args.out)
    payload = json.loads(source.read_text(encoding="utf-8"))
    changed = migrate(payload)
    destination.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Catalogo v2 pronto: {changed} produto(s) migrado(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
