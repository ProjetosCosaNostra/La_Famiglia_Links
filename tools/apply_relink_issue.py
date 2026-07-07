#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Link Guardian — aplica correção em lote v3 por Issue.
Lê o JSON gerado pelo relink-lote.html no corpo de uma issue, atualiza produtos.json,
baixa/converte imagens novas para WebP e mantém imagens antigas quando campos estão vazios.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import re
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Tuple

try:
    from PIL import Image
except Exception:  # Pillow é instalado na Action
    Image = None

JSON_BLOCK_RE = re.compile(r"```(?:json)?\s*(\{.*?\})\s*```", re.DOTALL | re.IGNORECASE)
ID_RE = re.compile(r"^5J5PKG-[A-Z0-9]+$", re.I)


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def slug_safe(s: str) -> str:
    s = (s or "produto").lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")[:90] or "produto"


def load_issue_payload(body: str) -> Dict[str, Any]:
    body = body.strip()
    match = JSON_BLOCK_RE.search(body)
    raw = match.group(1) if match else body
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise SystemExit(f"ERRO: não consegui ler JSON no corpo da issue: {exc}")
    if not isinstance(payload, dict):
        raise SystemExit("ERRO: payload precisa ser um objeto JSON.")
    corrections = payload.get("corrections")
    if not isinstance(corrections, list) or not corrections:
        raise SystemExit("ERRO: payload precisa ter corrections com pelo menos 1 item.")
    return payload


def read_json(path: Path) -> Dict[str, Any]:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def write_json(path: Path, data: Dict[str, Any]) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def normalize_url_list(value: Any) -> List[str]:
    if value is None:
        return []
    if isinstance(value, list):
        items = value
    else:
        items = re.split(r"[\r\n]+", str(value))
    return [str(x).strip() for x in items if str(x).strip()]


def validate_payload(payload: Dict[str, Any]) -> List[str]:
    errors: List[str] = []
    for i, c in enumerate(payload.get("corrections", []), 1):
        if not isinstance(c, dict):
            errors.append(f"corrections[{i}] não é objeto.")
            continue
        sku = str(c.get("sku", "")).strip()
        if not sku:
            errors.append(f"corrections[{i}] sem sku.")
        id_busca = str(c.get("id_busca", "")).strip()
        if id_busca and not ID_RE.match(id_busca):
            errors.append(f"{sku}: id_busca parece inválido: {id_busca}")
        open_url = str(c.get("open_url", "")).strip()
        if open_url and not re.match(r"^https?://", open_url, re.I):
            errors.append(f"{sku}: open_url precisa começar com http/https.")
        cover = str(c.get("cover_image_url", "")).strip()
        if cover and not re.match(r"^(https?://|assets/)", cover, re.I):
            errors.append(f"{sku}: cover_image_url precisa ser URL http(s) ou caminho assets/.")
        extras = normalize_url_list(c.get("extra_image_urls"))
        mode = str(c.get("extras_mode", "")).strip().lower()
        if extras and mode not in {"add", "replace"}:
            errors.append(f"{sku}: extra_image_urls preenchido exige extras_mode 'add' ou 'replace'.")
        for u in extras:
            if not re.match(r"^(https?://|assets/)", u, re.I):
                errors.append(f"{sku}: imagem extra inválida: {u}")
    return errors


def download_bytes(url: str, timeout: int = 40) -> bytes:
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 LinkGuardianRelink/3.0",
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    })
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def convert_to_webp(url: str, out_dir: Path, sku: str, kind: str, index: int | None = None) -> str:
    """Baixa imagem remota e salva WebP. Se já for caminho assets/, retorna como está."""
    url = url.strip()
    if url.startswith("assets/"):
        return url
    if Image is None:
        raise RuntimeError("Pillow não está instalado; não consigo converter imagem para WebP.")

    raw = download_bytes(url)
    h = hashlib.sha1((url + str(len(raw))).encode("utf-8")).hexdigest()[:10]
    prefix = slug_safe(sku)
    if kind == "cover":
        name = f"{prefix}-cover-{h}.webp"
    else:
        idx = index if index is not None else 1
        name = f"{prefix}-images-{idx:02d}-{h}.webp"
    out_dir.mkdir(parents=True, exist_ok=True)
    dest = out_dir / name

    with Image.open(io.BytesIO(raw)) as im:
        if im.mode not in ("RGB", "RGBA"):
            im = im.convert("RGBA" if "A" in im.getbands() else "RGB")
        # Mantém proporção, evita arquivos gigantes.
        max_side = 1400
        w, hgt = im.size
        if max(w, hgt) > max_side:
            scale = max_side / max(w, hgt)
            im = im.resize((int(w * scale), int(hgt * scale)))
        im.save(dest, "WEBP", quality=86, method=6)
    return str(dest).replace("\\", "/")


def product_index(products: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    return {str(p.get("sku", "")).strip(): p for p in products if str(p.get("sku", "")).strip()}


def apply_one(product: Dict[str, Any], correction: Dict[str, Any], assets_dir: Path, now: str) -> Tuple[bool, List[str]]:
    sku = str(correction.get("sku", "")).strip()
    changes: List[str] = []

    title = str(correction.get("title", "")).strip()
    if title and product.get("title") != title:
        product["title"] = title
        product["issue_title"] = title
        changes.append("title")

    id_busca = str(correction.get("id_busca", "")).strip().upper()
    if id_busca and product.get("id_busca") != id_busca:
        product["id_busca"] = id_busca
        product["canonical_url"] = f"https://lista.mercadolivre.com.br/{id_busca}"
        changes.append("id_busca/canonical_url")

    open_url = str(correction.get("open_url", "")).strip()
    if open_url:
        for key in ("open_url", "short_url", "relink_open_url", "check_url", "resolved_url"):
            if product.get(key) != open_url:
                product[key] = open_url
        changes.append("links")

    cover_url = str(correction.get("cover_image_url", "")).strip()
    if cover_url:
        new_cover = convert_to_webp(cover_url, assets_dir, sku, "cover")
        if product.get("image") != new_cover:
            product["image"] = new_cover
            product["image_original"] = cover_url
            product["webp_optimized_at"] = now
            changes.append("cover")

    extra_urls = normalize_url_list(correction.get("extra_image_urls"))
    if extra_urls:
        mode = str(correction.get("extras_mode", "")).strip().lower()
        current = list(product.get("images") or [])
        start = 1 if mode == "replace" else len(current) + 1
        new_paths = []
        for offset, u in enumerate(extra_urls):
            new_paths.append(convert_to_webp(u, assets_dir, sku, "extra", start + offset))
        if mode == "replace":
            product["images"] = new_paths
            product["images_original"] = extra_urls
            changes.append(f"extras replace ({len(new_paths)})")
        else:
            product["images"] = current + new_paths
            old_orig = list(product.get("images_original") or [])
            product["images_original"] = old_orig + extra_urls
            changes.append(f"extras add ({len(new_paths)})")
        product["webp_optimized_at"] = now

    if changes:
        # Limpa estado de revisão do Link Guardian para produto relinkado manualmente.
        product["active"] = True
        product["review_action"] = "manter"
        product["review_status"] = "ativo"
        product["review_reason"] = ""
        product["replacement_vendor"] = ""
        product["notes"] = f"Relink em lote aplicado em {now}."
        product["guardian_fail_count"] = 0
        product["guardian_confidence_score"] = 90
        product["guardian_confidence_bucket"] = "manual_relink"
        product["guardian_reason_bucket"] = "manual_relink_lote"
        product["guardian_last_checked"] = now
        product["guardian_last_status"] = 200
        product["guardian_last_reason"] = "manual_relink_lote"
        if product.get("open_url"):
            product["guardian_last_checked_url"] = product["open_url"]
            product["guardian_last_final_url"] = product.get("canonical_url") or product["open_url"]
        product["last_checked"] = now
        product["last_ok"] = now
    return bool(changes), changes


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--issue-body-file", required=True)
    ap.add_argument("--produtos", default="produtos.json")
    ap.add_argument("--assets-dir", default="assets/produtos-webp")
    ap.add_argument("--report", default="relink_lote_report.md")
    ap.add_argument("--env-file", default="relink_lote_result.env")
    args = ap.parse_args()

    body = Path(args.issue_body_file).read_text(encoding="utf-8")
    payload = load_issue_payload(body)
    errors = validate_payload(payload)
    if errors:
        report = "# Relink lote — ERRO\n\n" + "\n".join(f"- {e}" for e in errors) + "\n"
        Path(args.report).write_text(report, encoding="utf-8")
        raise SystemExit(report)

    dry_run = bool(payload.get("dry_run", False))
    produtos_path = Path(args.produtos)
    data = read_json(produtos_path)
    products = data.get("products")
    if not isinstance(products, list):
        raise SystemExit("ERRO: produtos.json não tem lista products.")
    by_sku = product_index(products)
    now = utc_now()
    assets_dir = Path(args.assets_dir)

    report_lines = ["# Relink lote — relatório", "", f"Data: {now}", f"Dry run: {dry_run}", ""]
    changed_any = False
    updated_count = 0
    missing: List[str] = []

    for c in payload.get("corrections", []):
        sku = str(c.get("sku", "")).strip()
        product = by_sku.get(sku)
        if not product:
            missing.append(sku)
            report_lines.append(f"- ❌ `{sku}` não encontrado no produtos.json.")
            continue
        # Em dry_run, aplica em cópia para validar imagens? Não baixa imagens no dry-run para evitar lentidão/custo.
        target = dict(product) if dry_run else product
        if dry_run:
            # Simula campos textuais e informa imagens sem baixar.
            simulated_changes = []
            for key,label in [("title","title"),("id_busca","id_busca"),("open_url","links")]:
                if str(c.get(key," ")).strip(): simulated_changes.append(label)
            if str(c.get("cover_image_url","")).strip(): simulated_changes.append("cover")
            extras = normalize_url_list(c.get("extra_image_urls"))
            if extras: simulated_changes.append(f"extras {c.get('extras_mode')} ({len(extras)})")
            changed = bool(simulated_changes)
            changes = simulated_changes
        else:
            changed, changes = apply_one(target, c, assets_dir, now)
        if changed:
            changed_any = True
            updated_count += 1
            report_lines.append(f"- ✅ `{sku}`: " + ", ".join(changes))
        else:
            report_lines.append(f"- ⚪ `{sku}`: sem alteração efetiva.")

    if missing:
        report_lines.append("")
        report_lines.append("## SKUs não encontrados")
        report_lines.extend(f"- `{x}`" for x in missing)

    if changed_any and not dry_run:
        data["updated_at"] = now
        write_json(produtos_path, data)

    report_lines.append("")
    report_lines.append(f"Atualizados: {updated_count}")
    Path(args.report).write_text("\n".join(report_lines) + "\n", encoding="utf-8")
    Path(args.env_file).write_text(
        f"CHANGED={'true' if changed_any else 'false'}\nDRY_RUN={'true' if dry_run else 'false'}\nUPDATED_COUNT={updated_count}\n",
        encoding="utf-8",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
