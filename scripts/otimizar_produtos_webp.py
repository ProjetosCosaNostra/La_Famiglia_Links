#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Cosa Nostra — Otimizador automático de imagens para WebP

O que faz:
- Lê produtos.json.
- Baixa imagens remotas dos campos image/images/galeria/etc.
- Converte para WebP leve.
- Salva em assets/produtos-webp/.
- Atualiza o produtos.json para usar os arquivos .webp locais.
- Preserva os links originais em image_original/images_original/etc.

Uso local:
  py -m pip install -r scripts/requirements-webp.txt
  py scripts/otimizar_produtos_webp.py --input produtos.json --out produtos.json

Uso seguro/teste:
  py scripts/otimizar_produtos_webp.py --input produtos.json --out produtos.json --dry-run
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
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Tuple
from urllib.parse import urlparse

import requests
from PIL import Image, ImageOps

IMAGE_ARRAY_FIELDS = [
    "images",
    "imagens",
    "gallery",
    "galeria",
    "gallery_images",
    "image_gallery",
    "extra_images",
    "images_extra",
    "additional_images",
    "product_images",
]

IMAGE_SINGLE_FIELDS = ["image", "img", "image_url", "imageUrl", "imageURL", "image_path", "imagePath", "media", "cover"]

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
)


def is_remote_url(value: Any) -> bool:
    if not isinstance(value, str):
        return False
    value = value.strip()
    return value.startswith("http://") or value.startswith("https://")


def is_data_image(value: Any) -> bool:
    return isinstance(value, str) and value.strip().lower().startswith("data:image/")


def is_local_webp(value: Any) -> bool:
    if not isinstance(value, str):
        return False
    v = value.strip().lower().split("?")[0]
    return v.endswith(".webp") and not is_remote_url(value)


def slugify(value: Any, fallback: str = "produto") -> str:
    text = str(value or "").strip().lower()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    text = re.sub(r"-+", "-", text).strip("-")
    return text[:90] or fallback


def short_hash(text: str, n: int = 10) -> str:
    return hashlib.sha1(text.encode("utf-8", errors="ignore")).hexdigest()[:n]


def norm_rel_path(path: Path) -> str:
    return str(path).replace("\\", "/")


def download_image(session: requests.Session, url: str, timeout: int, retries: int) -> bytes:
    last_error: Exception | None = None
    headers = {"User-Agent": USER_AGENT, "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8"}

    for attempt in range(1, retries + 1):
        try:
            r = session.get(url, timeout=timeout, allow_redirects=True, headers=headers)
            r.raise_for_status()
            content_type = (r.headers.get("content-type") or "").lower()
            if "text/html" in content_type and len(r.content) > 200:
                raise RuntimeError(f"URL retornou HTML, não imagem: {content_type}")
            if not r.content:
                raise RuntimeError("download vazio")
            return r.content
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            if attempt < retries:
                time.sleep(min(2.0 * attempt, 6.0))

    raise RuntimeError(f"falha ao baixar {url}: {last_error}")


def convert_bytes_to_webp(raw: bytes, out_file: Path, max_size: int, quality: int, lossless: bool = False) -> Tuple[int, int]:
    out_file.parent.mkdir(parents=True, exist_ok=True)

    with Image.open(io.BytesIO(raw)) as img:
        img = ImageOps.exif_transpose(img)

        # Reduz mantendo proporção. 1000px costuma ser suficiente para card + lightbox sem pesar.
        w, h = img.size
        biggest = max(w, h)
        if max_size and biggest > max_size:
            scale = max_size / float(biggest)
            new_size = (max(1, int(w * scale)), max(1, int(h * scale)))
            img = img.resize(new_size, Image.Resampling.LANCZOS)

        # Preserva transparência quando existir.
        if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
            img = img.convert("RGBA")
        else:
            img = img.convert("RGB")

        img.save(
            out_file,
            format="WEBP",
            quality=quality,
            method=6,
            optimize=True,
            lossless=lossless,
        )
        return img.size


def original_field_name(field_name: str) -> str:
    if field_name.endswith("_original"):
        return field_name
    return f"{field_name}_original"


def make_output_path(assets_dir: Path, sku: str, field_name: str, index: int, url: str) -> Path:
    safe_sku = slugify(sku, fallback="produto")
    field_slug = slugify(field_name, fallback="img")
    suffix = "cover" if field_name == "image" and index == 0 else f"{field_slug}-{index + 1:02d}"
    return assets_dir / f"{safe_sku}-{suffix}-{short_hash(url)}.webp"


def optimize_url(
    *,
    session: requests.Session,
    url: str,
    repo_root: Path,
    assets_dir: Path,
    sku: str,
    field_name: str,
    index: int,
    max_size: int,
    quality: int,
    timeout: int,
    retries: int,
    dry_run: bool,
) -> Tuple[str, Dict[str, Any]]:
    info: Dict[str, Any] = {"source": url, "status": "skipped"}

    if not is_remote_url(url):
        info["reason"] = "not_remote"
        return url, info

    if is_local_webp(url):
        info["reason"] = "already_local_webp"
        return url, info

    out_file_abs = make_output_path(assets_dir, sku, field_name, index, url)
    rel_path = norm_rel_path(out_file_abs.relative_to(repo_root))

    if out_file_abs.exists() and out_file_abs.stat().st_size > 0:
        info.update({"status": "exists", "output": rel_path, "bytes": out_file_abs.stat().st_size})
        return rel_path, info

    if dry_run:
        info.update({"status": "dry_run", "output": rel_path})
        return rel_path, info

    raw = download_image(session, url, timeout=timeout, retries=retries)
    before = len(raw)
    size = convert_bytes_to_webp(raw, out_file_abs, max_size=max_size, quality=quality)
    after = out_file_abs.stat().st_size
    ratio = round((1 - (after / before)) * 100, 1) if before else None
    info.update({
        "status": "converted",
        "output": rel_path,
        "original_bytes": before,
        "webp_bytes": after,
        "saved_percent": ratio,
        "size": {"width": size[0], "height": size[1]},
    })
    return rel_path, info


def convert_single_field(p: Dict[str, Any], field: str, context: Dict[str, Any]) -> List[Dict[str, Any]]:
    results: List[Dict[str, Any]] = []
    value = p.get(field)
    if not is_remote_url(value):
        return results

    orig_field = original_field_name(field)
    if orig_field not in p:
        p[orig_field] = value

    new_value, info = optimize_url(url=value, field_name=field, index=0, **context)
    if info.get("status") in {"converted", "exists", "dry_run"}:
        p[field] = new_value
    else:
        p.setdefault("_webp_failed_images", []).append({field: value, "reason": info.get("reason")})
    results.append(info)
    return results


def convert_array_field(p: Dict[str, Any], field: str, context: Dict[str, Any]) -> List[Dict[str, Any]]:
    results: List[Dict[str, Any]] = []
    value = p.get(field)
    if not isinstance(value, list) or not value:
        return results

    has_remote = any(is_remote_url(x) for x in value if isinstance(x, str))
    if not has_remote:
        return results

    orig_field = original_field_name(field)
    if orig_field not in p:
        # Só preserva uma cópia simples quando for lista de strings.
        p[orig_field] = list(value)

    new_list: List[Any] = []
    for idx, item in enumerate(value):
        if isinstance(item, str) and is_remote_url(item):
            new_url, info = optimize_url(url=item, field_name=field, index=idx, **context)
            new_list.append(new_url if info.get("status") in {"converted", "exists", "dry_run"} else item)
            results.append(info)
        elif isinstance(item, dict):
            item2 = dict(item)
            image_key = None
            for key in ["url", "src", "image", "image_url", "href"]:
                if is_remote_url(item2.get(key)):
                    image_key = key
                    break
            if image_key:
                new_url, info = optimize_url(url=item2[image_key], field_name=field, index=idx, **context)
                if info.get("status") in {"converted", "exists", "dry_run"}:
                    item2.setdefault(f"{image_key}_original", item2[image_key])
                    item2[image_key] = new_url
                results.append(info)
            new_list.append(item2)
        else:
            new_list.append(item)

    p[field] = new_list
    return results


def optimize_products(data: Dict[str, Any], args: argparse.Namespace) -> Dict[str, Any]:
    repo_root = Path(args.repo_root).resolve()
    assets_dir = (repo_root / args.assets_dir).resolve()
    session = requests.Session()

    products = data.get("products", [])
    if not isinstance(products, list):
        raise ValueError("O JSON precisa ter uma lista em products")

    converted = 0
    exists = 0
    failed = 0
    dry = 0
    touched_products = 0
    details: List[Dict[str, Any]] = []

    for idx, p in enumerate(products):
        if not isinstance(p, dict):
            continue

        sku = str(p.get("sku") or p.get("id_busca") or p.get("id") or f"produto-{idx+1}")
        product_results: List[Dict[str, Any]] = []
        context = dict(
            session=session,
            repo_root=repo_root,
            assets_dir=assets_dir,
            sku=sku,
            max_size=args.max_size,
            quality=args.quality,
            timeout=args.timeout,
            retries=args.retries,
            dry_run=args.dry_run,
        )

        # Campo principal e aliases comuns.
        for field in IMAGE_SINGLE_FIELDS:
            try:
                product_results.extend(convert_single_field(p, field, context))
            except Exception as exc:  # noqa: BLE001
                failed += 1
                p.setdefault("_webp_failed_images", []).append({field: p.get(field), "error": str(exc)})
                product_results.append({"status": "failed", "field": field, "error": str(exc)})

        # Galerias/listas.
        for field in IMAGE_ARRAY_FIELDS:
            try:
                product_results.extend(convert_array_field(p, field, context))
            except Exception as exc:  # noqa: BLE001
                failed += 1
                p.setdefault("_webp_failed_images", []).append({field: p.get(field), "error": str(exc)})
                product_results.append({"status": "failed", "field": field, "error": str(exc)})

        # Campos image_2, imagem_2 etc.
        for n in range(2, 13):
            for field in [f"image_{n}", f"imagem_{n}", f"image{n}", f"imagem{n}"]:
                try:
                    product_results.extend(convert_single_field(p, field, context))
                except Exception as exc:  # noqa: BLE001
                    failed += 1
                    p.setdefault("_webp_failed_images", []).append({field: p.get(field), "error": str(exc)})
                    product_results.append({"status": "failed", "field": field, "error": str(exc)})

        if product_results:
            touched_products += 1
            now = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
            p["webp_optimized_at"] = now
            details.append({"sku": sku, "results": product_results})
            for r in product_results:
                if r.get("status") == "converted":
                    converted += 1
                elif r.get("status") == "exists":
                    exists += 1
                elif r.get("status") == "dry_run":
                    dry += 1
                elif r.get("status") == "failed":
                    failed += 1

    data["updated_at"] = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    data["webp_optimization"] = {
        "updated_at": data["updated_at"],
        "assets_dir": args.assets_dir.replace("\\", "/"),
        "quality": args.quality,
        "max_size": args.max_size,
        "products_touched": touched_products,
        "converted": converted,
        "already_existed": exists,
        "dry_run": dry,
        "failed": failed,
        "note": "Campos originais preservados em *_original.",
    }

    if args.report:
        Path(args.report).write_text(json.dumps(details, ensure_ascii=False, indent=2), encoding="utf-8")

    print(json.dumps(data["webp_optimization"], ensure_ascii=False, indent=2))
    return data


def main() -> int:
    parser = argparse.ArgumentParser(description="Converte imagens de produtos.json para WebP local.")
    parser.add_argument("--input", default="produtos.json", help="Caminho do produtos.json")
    parser.add_argument("--out", default="produtos.json", help="Arquivo JSON de saída")
    parser.add_argument("--repo-root", default=".", help="Raiz do repositório")
    parser.add_argument("--assets-dir", default="assets/produtos-webp", help="Pasta onde salvar os WebP")
    parser.add_argument("--quality", type=int, default=78, help="Qualidade WebP 1-100")
    parser.add_argument("--max-size", type=int, default=1000, help="Maior lado da imagem em px")
    parser.add_argument("--timeout", type=int, default=35, help="Timeout por download em segundos")
    parser.add_argument("--retries", type=int, default=3, help="Tentativas por imagem")
    parser.add_argument("--dry-run", action="store_true", help="Não baixa nem grava imagens; só simula caminhos")
    parser.add_argument("--report", default="", help="Arquivo JSON de relatório detalhado opcional")
    args = parser.parse_args()

    input_path = Path(args.input)
    if not input_path.exists():
        print(f"ERRO: arquivo não encontrado: {input_path}", file=sys.stderr)
        return 2

    data = json.loads(input_path.read_text(encoding="utf-8"))
    data = optimize_products(data, args)

    out_path = Path(args.out)
    out_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
