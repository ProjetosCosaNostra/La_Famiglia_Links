"""Baixa estatisticas agregadas da vitrine sem expor o segredo nos logs."""

from __future__ import annotations

import argparse
import os
import urllib.request
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="data/campaign_stats.json")
    args = parser.parse_args()

    url = (os.getenv("CAMPAIGN_STATS_URL") or "").strip()
    token = (os.getenv("CAMPAIGN_STATS_TOKEN") or "").strip()
    if not url or not token:
        print("Estatisticas remotas ainda nao configuradas; memoria local preservada.")
        return 0

    request = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}", "Accept": "application/json"})
    with urllib.request.urlopen(request, timeout=30) as response:
        payload = response.read()
    destination = Path(args.out)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(payload)
    print(f"Estatisticas atualizadas em {destination}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
