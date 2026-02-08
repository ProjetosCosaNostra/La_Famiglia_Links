#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path


RE_IMAGE_URL = re.compile(
    r"(https?://[^\s)]+)",
    re.IGNORECASE
)

def now_iso():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def load_json(path: Path):
    if not path.exists():
        return {"updated_at": now_iso(), "products": []}
    return json.loads(path.read_text(encoding="utf-8"))


def save_json(path: Path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def find_first_image_url(text: str) -> str:
    """
    Aceita:
    - links com extensão (.png, .jpg, .jpeg, .webp)
    - links de anexos do GitHub (user-attachments/assets/...)
    - user-images.githubusercontent.com/...
    """
    if not text:
        return ""

    candidates = RE_IMAGE_URL.findall(text)
    if not candidates:
        return ""

    def looks_like_image(u: str) -> bool:
        u_low = u.lower()
        if any(u_low.endswith(ext) for ext in [".png", ".jpg", ".jpeg", ".webp"]):
            return True
        if "github.com/user-attachments/assets/" in u_low:
            return True
        if "user-images.githubusercontent.com" in u_low:
            return True
        return False

    for u in candidates:
        # limpa markdown possível: (url) já vem limpo; mas pode vir com ">" ou fim de frase
        u = u.strip().strip(">").strip().strip('"').strip("'")
        if looks_like_image(u):
            return u
    return ""


def parse_issue_form(body: str) -> dict:
    """
    Issue forms geram um markdown tipo:
    ### SKU (único)
    valor

    Para checkbox:
    - [x] Definir como Produto do Dia...
    """
    result = {}

    def pick(section_title: str) -> str:
        # captura texto após "### {section_title}" até antes do próximo "### "
        pattern = re.compile(rf"###\s+{re.escape(section_title)}\s*\n(.*?)(?=\n###\s+|\Z)", re.DOTALL)
        m = pattern.search(body or "")
        if not m:
            return ""
        val = m.group(1).strip()
        # remove placeholders típicos
        val = re.sub(r"^\s*_(No response|Sem resposta)_\s*$", "", val, flags=re.IGNORECASE).strip()
        return val

    # Campos do template
    result["sku"] = pick("SKU (único)")
    result["title"] = pick("Título")
    result["id_busca"] = pick("ID de Busca (Mercado Livre)")
    result["open_url"] = pick("Link /sec/ (Mercado Livre)")
    result["image"] = pick("Imagem (opcional)")
    result["badges"] = pick("Badges (separado por vírgula)")
    result["price_text"] = pick("Preço (texto opcional)")
    result["active"] = pick("Ativo na vitrine?")

    # Checkbox featured (se marcado aparece "- [x] ...")
    result["featured_checked"] = bool(re.search(r"-\s+\[x\]\s+Definir como Produto do Dia", body or "", re.IGNORECASE))

    return result


def ensure_products_list(db: dict) -> list:
    if isinstance(db, dict) and isinstance(db.get("products"), list):
        return db["products"]
    db["products"] = []
    return db["products"]


def upsert_product(products: list, sku: str, new_item: dict):
    # procura por sku
    idx = None
    for i, p in enumerate(products):
        if str(p.get("sku", "")).strip() == sku:
            idx = i
            break
    if idx is None:
        products.append(new_item)
    else:
        # update mantendo campos que não vierem preenchidos
        merged = dict(products[idx])
        for k, v in new_item.items():
            if v is None:
                continue
            # não sobrescreve com vazio (ex: "" ou []), exceto se for booleano
            if isinstance(v, bool):
                merged[k] = v
            elif isinstance(v, str):
                if v.strip() != "":
                    merged[k] = v
            elif isinstance(v, list):
                if len(v) > 0:
                    merged[k] = v
            else:
                merged[k] = v
        products[idx] = merged


def set_featured_by_sku(products: list, sku: str):
    found = False
    for p in products:
        if str(p.get("sku", "")).strip() == sku:
            p["featured"] = True
            found = True
        else:
            p["featured"] = False
    return found


def main():
    event_path = os.environ.get("GITHUB_EVENT_PATH", "")
    if not event_path:
        raise SystemExit("GITHUB_EVENT_PATH not set")

    event = json.loads(Path(event_path).read_text(encoding="utf-8"))
    issue = event.get("issue") or {}
    body = issue.get("body") or ""
    labels = [l.get("name", "") for l in (issue.get("labels") or [])]

    repo_root = Path(".").resolve()
    produtos_path = repo_root / "produtos.json"
    db = load_json(produtos_path)
    products = ensure_products_list(db)

    is_novo = "cms:novo-produto" in labels
    is_set_pd = "cms:produto-do-dia" in labels

    if not (is_novo or is_set_pd):
        # nada a fazer
        return

    if is_set_pd:
        # parse sku do form
        data = parse_issue_form(body)
        sku = (data.get("sku") or "").strip()
        if not sku:
            raise SystemExit("SKU vazio na issue de Produto do Dia")

        ok = set_featured_by_sku(products, sku)
        if not ok:
            raise SystemExit(f"SKU não encontrado no produtos.json: {sku}")

        db["updated_at"] = now_iso()
        save_json(produtos_path, db)
        return

    # Novo produto
    data = parse_issue_form(body)

    sku = (data.get("sku") or "").strip()
    title = (data.get("title") or "").strip()
    id_busca = (data.get("id_busca") or "").strip()
    open_url = (data.get("open_url") or "").strip()

    if not sku or not title or not id_busca or not open_url:
        raise SystemExit("Campos obrigatórios faltando (sku/title/id_busca/open_url)")

    # badges
    badges_raw = (data.get("badges") or "").strip()
    badges = []
    if badges_raw:
        badges = [b.strip() for b in badges_raw.split(",") if b.strip()]

    # image: preferir campo 'image', senão tentar pegar do corpo (anexo)
    image_field = (data.get("image") or "").strip()
    image_url = image_field if image_field else find_first_image_url(body)

    # active
    active_str = (data.get("active") or "true").strip().lower()
    active = (active_str == "true")

    # price_text
    price_text = (data.get("price_text") or "").strip()

    new_item = {
        "sku": sku,
        "title": title,
        "badges": badges,
        "id_busca": id_busca,
        "open_url": open_url,
        "check_url": open_url,
        "image": image_url if image_url else "",
        "price_text": price_text,
        "active": active,
        # featured só muda se usuário escolheu na issue
        # se não escolheu, não forçamos nada (mantém o que já existia ou fica ausente/false)
    }

    featured_checked = bool(data.get("featured_checked"))
    if featured_checked:
        # marca esse e desmarca os outros
        set_featured_by_sku(products, sku)
        new_item["featured"] = True

    upsert_product(products, sku, new_item)

    db["updated_at"] = now_iso()
    save_json(produtos_path, db)


if __name__ == "__main__":
    main()
