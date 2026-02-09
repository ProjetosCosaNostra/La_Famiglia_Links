#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path


def utc_now_iso():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def read_json(path: Path):
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def slugify_sku(s: str) -> str:
    s = (s or "").strip().lower()
    s = re.sub(r"[^\w\-]+", "-", s, flags=re.UNICODE)
    s = re.sub(r"-{2,}", "-", s)
    return s.strip("-")


def first_image_url(text: str) -> str:
    if not text:
        return ""

    # Markdown image: ![alt](url)
    m = re.search(r"!\[[^\]]*\]\((https?://[^\s)]+)\)", text, flags=re.IGNORECASE)
    if m:
        return m.group(1).strip()

    # Any direct image-ish URL
    m = re.search(r"(https?://[^\s)]+?\.(?:png|jpg|jpeg|webp|gif))(?:\?[^\s)]*)?", text, flags=re.IGNORECASE)
    if m:
        return m.group(1).strip()

    # GitHub "user-attachments" / "user-images" urls without extension
    m = re.search(r"(https?://(?:github\.com/user-attachments|user-images\.githubusercontent)\S+)", text, flags=re.IGNORECASE)
    if m:
        return m.group(1).strip()

    return ""


def parse_issue_form_fields(body: str) -> dict:
    """
    Issue Forms viram um markdown tipo:

    ### SKU (único)
    xiaomi-redmi...

    A gente extrai por headings ### ...
    """
    fields = {}
    if not body:
        return fields

    parts = re.split(r"\n(?=###\s+)", body)
    for p in parts:
        p = p.strip()
        if not p.startswith("### "):
            continue
        lines = p.splitlines()
        heading = lines[0].replace("###", "").strip()
        value = "\n".join(lines[1:]).strip()
        # remove possíveis "No response"
        value = re.sub(r"^\s*_No response_\s*$", "", value, flags=re.IGNORECASE).strip()
        key = heading.lower().strip()
        fields[key] = value

    # Checkboxes aparecem dentro de um bloco, ex: - [x] Ativo
    # Vamos detectar também:
    checks = {}
    for line in (body or "").splitlines():
        line = line.strip()
        m = re.match(r"^- \[(x| )\]\s+(.*)$", line, flags=re.IGNORECASE)
        if m:
            checked = (m.group(1).lower() == "x")
            label = m.group(2).strip().lower()
            checks[label] = checked
    fields["_checks"] = checks

    return fields


def ensure_produtos_schema(data):
    if data is None or not isinstance(data, dict):
        data = {"updated_at": utc_now_iso(), "products": []}

    if "products" not in data or not isinstance(data["products"], list):
        data["products"] = []

    if "updated_at" not in data:
        data["updated_at"] = utc_now_iso()

    return data


def find_product(products, sku):
    for i, p in enumerate(products):
        if str(p.get("sku", "")).strip().lower() == sku.strip().lower():
            return i, p
    return -1, None


def set_featured_unique(products, sku_to_feature: str):
    sku_to_feature = sku_to_feature.strip().lower()
    for p in products:
        p["featured"] = (str(p.get("sku", "")).strip().lower() == sku_to_feature)


def update_or_create_product(data, sku, title, badges, id_busca, open_url, image_url, active, featured):
    data = ensure_produtos_schema(data)
    products = data["products"]

    idx, existing = find_product(products, sku)

    if idx == -1:
        p = {
            "sku": sku,
            "title": title or "",
            "badges": badges or [],
            "id_busca": id_busca or "",
            "open_url": open_url or "",
            "check_url": open_url or "",
            "image": image_url or "",
            "price_text": "",
            "active": bool(active),
            "featured": bool(featured),
            "last_checked": "",
            "last_ok": ""
        }
        products.append(p)
    else:
        p = existing
        p["sku"] = sku
        if title:
            p["title"] = title
        if badges is not None:
            p["badges"] = badges
        if id_busca is not None and id_busca != "":
            p["id_busca"] = id_busca
        if open_url:
            p["open_url"] = open_url
            p["check_url"] = open_url
        if image_url:
            p["image"] = image_url

        p["active"] = bool(active)
        # featured será aplicado abaixo de forma única
        p["featured"] = bool(featured)

    if featured:
        set_featured_unique(products, sku)

    data["updated_at"] = utc_now_iso()
    return data


def main():
    repo_root = Path(__file__).resolve().parents[1]
    produtos_path = repo_root / "produtos.json"

    event_path = os.environ.get("GITHUB_EVENT_PATH", "")
    if not event_path:
        raise RuntimeError("GITHUB_EVENT_PATH não encontrado.")

    event = read_json(Path(event_path))
    if not event:
        raise RuntimeError("Não consegui ler o payload do evento.")

    issue = event.get("issue") or {}
    labels = [l.get("name", "") for l in (issue.get("labels") or [])]
    body = issue.get("body") or ""

    data = read_json(produtos_path)
    data = ensure_produtos_schema(data)

    fields = parse_issue_form_fields(body)
    checks = fields.get("_checks", {})

    is_novo_produto = ("cms-novo-produto" in labels)
    is_produto_dia = ("cms-produto-do-dia" in labels)

    if not (is_novo_produto or is_produto_dia):
        # nada a fazer
        return

    # SKU pode vir com label diferente no heading dependendo do texto:
    def get_field_contains(sub):
        sub = sub.lower()
        for k, v in fields.items():
            if k == "_checks":
                continue
            if sub in k:
                return (v or "").strip()
        return ""

    if is_produto_dia:
        sku = slugify_sku(get_field_contains("sku"))
        if not sku:
            raise RuntimeError("SKU não informado no issue.")

        idx, prod = find_product(data["products"], sku)
        allow_create = checks.get("se o sku não existir, criar mesmo assim (com título vazio) — não recomendado", False)

        if idx == -1 and allow_create:
            data["products"].append({
                "sku": sku,
                "title": "",
                "badges": [],
                "id_busca": "",
                "open_url": "",
                "check_url": "",
                "image": "",
                "price_text": "",
                "active": True,
                "featured": True,
                "last_checked": "",
                "last_ok": ""
            })

        set_featured_unique(data["products"], sku)
        data["updated_at"] = utc_now_iso()
        write_json(produtos_path, data)
        return

    # Novo/Atualizar
    sku = slugify_sku(get_field_contains("sku"))
    title = get_field_contains("título") or get_field_contains("titulo") or get_field_contains("title")

    badges_raw = get_field_contains("badges") or get_field_contains("tags")
    badges = []
    if badges_raw:
        # separa por vírgula / quebra de linha
        tmp = re.split(r"[,\n]+", badges_raw)
        badges = [t.strip() for t in tmp if t.strip()]

    id_busca = get_field_contains("id mercado livre") or get_field_contains("id") or get_field_contains("id mercado")
    open_url = get_field_contains("link mercado livre") or get_field_contains("link") or get_field_contains("open_url")
    image_url = get_field_contains("imagem") or get_field_contains("image")

    # Se não veio URL explícita, tenta pegar a 1ª imagem colada/arrastada no issue
    if not image_url:
        image_url = first_image_url(body)

    active = checks.get("ativo (aparece na vitrine)", False)
    featured = checks.get("definir como produto do dia (featured)", False)

    if not sku:
        raise RuntimeError("SKU não informado.")
    if not open_url:
        raise RuntimeError("Link do Mercado Livre não informado.")

    data = update_or_create_product(
        data=data,
        sku=sku,
        title=title,
        badges=badges,
        id_busca=id_busca,
        open_url=open_url,
        image_url=image_url,
        active=active if ("ativo (aparece na vitrine)" in checks) else True,
        featured=featured
    )

    write_json(produtos_path, data)


if __name__ == "__main__":
    main()
