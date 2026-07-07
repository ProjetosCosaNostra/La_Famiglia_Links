#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Arquivo: tools/apply_relink_batch.py
Objetivo: aplicar correções em lote no produtos.json pelo GitHub Actions.

Entrada aceita:
1) Variável de ambiente RELINK_BATCH_JSON, colada no workflow; ou
2) Arquivo JSON informado por --input, exemplo: docs/RELINK_LOTE_INPUT.json.

Formato aceito:
{
  "corrections": [
    {
      "sku": "sku-do-produto",
      "title": "Novo título",
      "id_busca": "5J5PKG-XXXX",
      "open_url": "https://meli.la/xxxx",
      "cover_image_url": "https://...",              // opcional
      "extra_image_urls": ["https://..."],           // opcional
      "extras_mode": "add"                           // obrigatório só se enviar extras
    }
  ]
}

Regras de imagem:
- Sem cover_image_url/capa_url: mantém capa atual.
- Com cover_image_url/capa_url: troca somente a capa.
- Sem extra_image_urls/images_extra_urls: mantém extras atuais.
- Com extras novas: extras_mode é obrigatório.
  - add/acrescentar: mantém extras atuais e adiciona as novas.
  - replace/substituir: apaga extras atuais e usa só as novas.
- A opção das extras nunca altera a capa principal.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

try:
    import requests
    from PIL import Image, ImageOps
except Exception as exc:  # pragma: no cover
    print("ERRO: dependências ausentes. Instale com: python -m pip install requests pillow")
    print(exc)
    sys.exit(2)

ROOT = Path.cwd()
PRODUCTS_PATH = ROOT / "produtos.json"
ASSETS_DIR = ROOT / "assets" / "produtos-webp"
LOGS_DIR = ROOT / "logs"
REPORT_PATH = LOGS_DIR / "relink_lote_report.txt"
AFFILIATE_PREFIX = "https://lista.mercadolivre.com.br/"


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def normalize_bool(value: str | bool | None, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return default
    return str(value).strip().lower() in {"1", "true", "yes", "sim", "s", "y"}


def slugify(value: str, fallback: str = "produto") -> str:
    value = value.strip().lower()
    value = re.sub(r"[^a-z0-9\-_]+", "-", value)
    value = re.sub(r"-+", "-", value).strip("-")
    return value or fallback


def as_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(v).strip() for v in value if str(v).strip()]
    if isinstance(value, str):
        value = value.strip()
        if not value:
            return []
        parts: list[str] = []
        # Permite colar 1 por linha ou separado por vírgula.
        for line in value.replace(",", "\n").splitlines():
            line = line.strip()
            if line:
                parts.append(line)
        return parts
    text = str(value).strip()
    return [text] if text else []


def first_value(data: dict[str, Any], *keys: str) -> str:
    for key in keys:
        value = data.get(key)
        if value is not None and str(value).strip():
            return str(value).strip()
    return ""


def read_input_json(path: str | None) -> str:
    env_json = os.environ.get("RELINK_BATCH_JSON", "").strip()
    if env_json:
        return env_json
    if path:
        p = Path(path)
        if not p.is_absolute():
            p = ROOT / p
        if not p.exists():
            raise FileNotFoundError(f"Arquivo de lote não encontrado: {p}")
        return p.read_text(encoding="utf-8")
    raise ValueError("Nenhum JSON informado. Cole no workflow ou informe --input docs/RELINK_LOTE_INPUT.json")


def parse_payload(raw: str) -> list[dict[str, Any]]:
    raw = (raw or "").strip()
    if not raw:
        raise ValueError("JSON do lote está vazio.")
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(f"JSON do lote inválido: {exc}") from exc

    if isinstance(payload, list):
        corrections = payload
    elif isinstance(payload, dict):
        corrections = payload.get("corrections") or payload.get("items") or payload.get("produtos")
        if corrections is None and payload.get("sku"):
            corrections = [payload]
    else:
        corrections = None

    if not isinstance(corrections, list) or not corrections:
        raise ValueError("JSON precisa ser uma lista ou conter a chave corrections/items/produtos.")

    clean: list[dict[str, Any]] = []
    for idx, item in enumerate(corrections, start=1):
        if not isinstance(item, dict):
            raise ValueError(f"Item {idx} não é um objeto JSON.")
        sku = first_value(item, "sku", "old_sku")
        if not sku:
            raise ValueError(f"Item {idx} sem sku.")
        clean.append(item)
    return clean


def load_products() -> dict[str, Any]:
    if not PRODUCTS_PATH.exists():
        raise FileNotFoundError("produtos.json não encontrado na raiz do repositório.")
    data = json.loads(PRODUCTS_PATH.read_text(encoding="utf-8"))
    if not isinstance(data, dict) or not isinstance(data.get("products"), list):
        raise ValueError("produtos.json precisa ter a estrutura: { products: [...] }.")
    return data


def save_products(data: dict[str, Any]) -> None:
    data["updated_at"] = utc_now()
    PRODUCTS_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def build_index(products: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    index: dict[str, dict[str, Any]] = {}
    for product in products:
        sku = str(product.get("sku", "")).strip()
        if sku:
            index[sku] = product
    return index


def validate_url(url: str, field_name: str) -> None:
    if not url:
        return
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError(f"{field_name} inválido: {url}")


def canonical_from_id(id_busca: str) -> str:
    return f"{AFFILIATE_PREFIX}{id_busca}" if id_busca else ""


def download_image_to_webp(url: str, sku: str, kind: str, position: int) -> str:
    validate_url(url, "image_url")
    ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    headers = {
        "User-Agent": "Mozilla/5.0 (compatible; LinkGuardianRelink/2.0)",
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    }
    response = requests.get(url, headers=headers, timeout=35)
    response.raise_for_status()

    content_type = response.headers.get("content-type", "").lower()
    looks_like_image = "image" in content_type or url.lower().split("?")[0].endswith((".jpg", ".jpeg", ".png", ".webp", ".avif"))
    if not looks_like_image:
        raise ValueError(f"URL não parece ser imagem ({content_type}): {url}")

    raw = response.content
    digest = hashlib.sha1(raw).hexdigest()[:10]
    safe_sku = slugify(sku)
    filename = f"{safe_sku}-cover-{digest}.webp" if kind == "cover" else f"{safe_sku}-images-{position:02d}-{digest}.webp"
    out_path = ASSETS_DIR / filename

    try:
        with Image.open(BytesIO(raw)) as img:
            img = ImageOps.exif_transpose(img)
            if img.mode not in {"RGB", "RGBA"}:
                img = img.convert("RGB")
            if img.mode == "RGBA":
                img.save(out_path, "WEBP", quality=86, method=6)
            else:
                img.convert("RGB").save(out_path, "WEBP", quality=86, method=6)
    except Exception as exc:
        raise ValueError(f"Falha ao converter imagem para WebP: {url} | {exc}") from exc

    return str(out_path.relative_to(ROOT)).replace("\\", "/")


def normalize_extras_mode(value: str) -> str:
    value = (value or "").strip().lower()
    if value in {"add", "append", "acrescentar", "somar", "+"}:
        return "add"
    if value in {"replace", "substituir", "trocar", "reset", "overwrite"}:
        return "replace"
    return ""


def update_if_changed(product: dict[str, Any], key: str, value: Any) -> bool:
    if value is None:
        return False
    if product.get(key) != value:
        product[key] = value
        return True
    return False


def apply_one(product: dict[str, Any], correction: dict[str, Any], report: list[str]) -> bool:
    sku = str(product.get("sku", "")).strip()
    changed = False
    now = utc_now()

    new_title = first_value(correction, "title", "new_title", "titulo", "novo_titulo")
    new_id = first_value(correction, "id_busca", "new_id_busca", "id_ml", "new_id_ml", "id", "novo_id")
    new_open_url = first_value(correction, "open_url", "new_open_url", "link", "new_link", "url", "novo_link")
    new_canonical = first_value(correction, "canonical_url", "new_canonical_url")

    if new_open_url:
        validate_url(new_open_url, "open_url")
    if new_canonical:
        validate_url(new_canonical, "canonical_url")

    old_title = product.get("title", "")
    old_id = product.get("id_busca", "")
    old_link = product.get("open_url", "")

    if new_title:
        changed |= update_if_changed(product, "title", new_title)
        changed |= update_if_changed(product, "issue_title", new_title)

    if new_id:
        changed |= update_if_changed(product, "id_busca", new_id)

    if new_open_url:
        # O clique de compra e o Link Guardian passam a testar o link novo.
        for key in ("open_url", "short_url", "relink_open_url", "check_url", "resolved_url", "guardian_last_checked_url", "guardian_last_final_url"):
            changed |= update_if_changed(product, key, new_open_url)

    canonical = new_canonical or (canonical_from_id(new_id) if new_id else "")
    if canonical:
        changed |= update_if_changed(product, "canonical_url", canonical)

    cover_urls = as_list(
        correction.get("cover_image_url")
        or correction.get("cover_url")
        or correction.get("capa_url")
        or correction.get("new_cover_image_url")
        or correction.get("nova_capa")
    )
    if cover_urls:
        cover_url = cover_urls[0]
        path = download_image_to_webp(cover_url, sku, "cover", 1)
        changed |= update_if_changed(product, "image", path)
        changed |= update_if_changed(product, "image_original", cover_url)
        product["webp_optimized_at"] = now
        report.append(f"  - capa trocada: {path}")

    extra_urls = as_list(
        correction.get("extra_image_urls")
        or correction.get("extras_image_urls")
        or correction.get("images_extra_urls")
        or correction.get("new_extra_image_urls")
        or correction.get("imagens_extras")
        or correction.get("extras")
    )
    if extra_urls:
        mode = normalize_extras_mode(first_value(correction, "extras_mode", "extra_mode", "modo_extras"))
        if not mode:
            raise ValueError(
                f"SKU {sku}: você enviou imagens extras, mas não informou extras_mode. "
                "Use add/acrescentar ou replace/substituir."
            )
        new_paths: list[str] = []
        for idx, url in enumerate(extra_urls, start=1):
            new_paths.append(download_image_to_webp(url, sku, "extra", idx))

        current_images = product.get("images") if isinstance(product.get("images"), list) else []
        current_original = product.get("images_original") if isinstance(product.get("images_original"), list) else []

        if mode == "replace":
            product["images"] = new_paths
            product["images_original"] = extra_urls
            report.append(f"  - extras substituídas: {len(new_paths)} imagem(ns)")
        else:
            combined = list(current_images)
            for path in new_paths:
                if path not in combined:
                    combined.append(path)
            product["images"] = combined

            combined_original = list(current_original)
            for url in extra_urls:
                if url not in combined_original:
                    combined_original.append(url)
            product["images_original"] = combined_original
            report.append(f"  - extras acrescentadas: {len(new_paths)} imagem(ns)")

        product["webp_optimized_at"] = now
        changed = True

    if changed:
        product["active"] = True
        product["review_action"] = "manter"
        product["review_status"] = "ativo"
        product["review_reason"] = ""
        product["replacement_vendor"] = first_value(correction, "replacement_vendor", "vendedor", "seller")
        product["notes"] = first_value(correction, "notes", "observacao", "observação") or "Corrigido em lote pelo Link Guardian Relink."
        product["guardian_fail_count"] = 0
        product["guardian_confidence_score"] = 95
        product["guardian_confidence_bucket"] = "manual_relink"
        product["guardian_reason_bucket"] = "manual_relink_confirmado"
        product["guardian_last_checked"] = now
        product["guardian_last_status"] = 200
        product["guardian_last_reason"] = "manual_relink_lote"
        product["last_checked"] = now
        product["last_ok"] = now

        if old_title != product.get("title", ""):
            report.append(f"  - título: {old_title} -> {product.get('title', '')}")
        if old_id != product.get("id_busca", ""):
            report.append(f"  - ID: {old_id} -> {product.get('id_busca', '')}")
        if old_link != product.get("open_url", ""):
            report.append(f"  - link: {old_link} -> {product.get('open_url', '')}")

    return changed


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default=os.environ.get("RELINK_BATCH_FILE", "docs/RELINK_LOTE_INPUT.json"), help="Arquivo JSON do lote quando RELINK_BATCH_JSON estiver vazio.")
    parser.add_argument("--dry-run", default=os.environ.get("RELINK_DRY_RUN", "true"), help="true/false")
    args = parser.parse_args()

    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    dry_run = normalize_bool(args.dry_run, default=True)
    report: list[str] = [f"Atualizado em: {utc_now()}", f"Dry run: {dry_run}", ""]

    try:
        raw = read_input_json(args.input)
        corrections = parse_payload(raw)
        data = load_products()
        products = data["products"]
        index = build_index(products)

        changed_count = 0
        for correction in corrections:
            sku = first_value(correction, "sku", "old_sku")
            product = index.get(sku)
            if not product:
                raise ValueError(f"SKU não encontrado no produtos.json: {sku}")

            report.append(f"SKU: {sku}")
            changed = apply_one(product, correction, report)
            if changed:
                changed_count += 1
                report.append("  - status: ALTERADO")
            else:
                report.append("  - status: sem alteração; confira se você preencheu title/id_busca/open_url ou imagens novas")
            report.append("")

        report.append(f"Total recebido: {len(corrections)}")
        report.append(f"Total alterado: {changed_count}")

        if dry_run:
            report.append("Resultado: teste concluído; produtos.json NÃO foi salvo.")
        else:
            save_products(data)
            report.append("Resultado: produtos.json salvo com sucesso.")

        REPORT_PATH.write_text("\n".join(report) + "\n", encoding="utf-8")
        print("\n".join(report))
        return 0
    except Exception as exc:
        report.append(f"ERRO: {exc}")
        REPORT_PATH.write_text("\n".join(report) + "\n", encoding="utf-8")
        print("\n".join(report), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
