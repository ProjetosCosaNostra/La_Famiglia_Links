#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Arquivo: tools/link_guardian_review_to_json.py
Objetivo: converter logs/link_guardian_review.txt em um JSON editável para Relink em Lote.

Saída padrão:
logs/link_guardian_relink_lote.json

Esse JSON NÃO corrige sozinho. Ele é o modelo/template para você preencher
com title/id_busca/open_url novos e depois rodar a Action de aplicação.
"""

from __future__ import annotations

import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path.cwd()


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def extract_value(block: str, label: str) -> str:
    # Captura linha no formato "Label: valor".
    pattern = rf"^{re.escape(label)}:\s*(.*)$"
    m = re.search(pattern, block, flags=re.MULTILINE)
    return (m.group(1).strip() if m else "")


def parse_review(text: str) -> list[dict[str, object]]:
    # Cada bloco começa em [ALTA], [MEDIA], [BAIXA] etc.
    starts = [m.start() for m in re.finditer(r"^\[[A-ZÁÉÍÓÚÂÊÔÃÕÇ_\- ]+\]", text, flags=re.MULTILINE)]
    blocks: list[str] = []
    for i, start in enumerate(starts):
        end = starts[i + 1] if i + 1 < len(starts) else len(text)
        blocks.append(text[start:end])

    items: list[dict[str, object]] = []
    seen: set[str] = set()
    for block in blocks:
        sku = extract_value(block, "SKU")
        if not sku or sku in seen:
            continue
        seen.add(sku)
        title = extract_value(block, "Título")
        old_id = extract_value(block, "ID ML")
        open_url = extract_value(block, "open_url")
        checked_url = extract_value(block, "checked_url")
        final_url = extract_value(block, "final_url")
        canonical_url = extract_value(block, "canonical_url")
        issue = extract_value(block, "Issue")
        issue_url = extract_value(block, "Issue URL")
        motivo = extract_value(block, "Motivo")
        confianca = extract_value(block, "Confiança")
        badges = extract_value(block, "Badges")

        items.append(
            {
                "sku": sku,
                "old_title": title,
                "old_id_busca": old_id,
                "old_open_url": open_url,
                "old_checked_url": checked_url,
                "old_final_url": final_url,
                "old_canonical_url": canonical_url,
                "issue": issue,
                "issue_url": issue_url,
                "motivo": motivo,
                "confianca": confianca,
                "badges": [b.strip() for b in badges.split(",") if b.strip()],
                "title": "",
                "id_busca": "",
                "open_url": "",
                "cover_image_url": "",
                "extra_image_urls": [],
                "extras_mode": "",
                "notes": ""
            }
        )
    return items


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", default="logs/link_guardian_review.txt")
    parser.add_argument("--output", default="logs/link_guardian_relink_lote.json")
    args = parser.parse_args()

    source = ROOT / args.source
    output = ROOT / args.output
    if not source.exists():
        raise FileNotFoundError(f"Arquivo não encontrado: {source}")

    text = source.read_text(encoding="utf-8", errors="replace")
    corrections = parse_review(text)
    payload = {
        "generated_at": utc_now(),
        "source": args.source,
        "total": len(corrections),
        "instrucoes": [
            "Preencha title, id_busca e open_url somente nos produtos que quer corrigir.",
            "cover_image_url é opcional; vazio mantém a capa atual.",
            "extra_image_urls é opcional; vazio mantém extras atuais.",
            "Se preencher extra_image_urls, extras_mode deve ser add ou replace.",
            "Depois cole este JSON na Action Link Guardian — Aplicar Relink em Lote, ou salve em docs/RELINK_LOTE_INPUT.json."
        ],
        "corrections": corrections,
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"JSON gerado: {output} ({len(corrections)} item/ns)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
