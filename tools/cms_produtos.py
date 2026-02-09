# ==========================================================
# Arquivo: tools/cms_produtos.py
# Módulo : CMS Produtos — Issue -> produtos.json (gh-pages)
# Versão : v3 (Issue Forms ### + Checkbox robusto + Preserva /sec case + Imagem HTML)
# ==========================================================

from __future__ import annotations

import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import quote_plus

REPO_ROOT = Path(__file__).resolve().parents[1]
PRODUTOS_JSON = REPO_ROOT / "produtos.json"


def _utc_now_iso_z() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _read_json(path: Path) -> Dict[str, Any]:
    if not path.exists():
        return {"updated_at": _utc_now_iso_z(), "products": []}
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def _write_json(path: Path, data: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")


def _extract_field(body: str, label_regex: str) -> str:
    """
    Pega o valor na linha imediatamente abaixo de um "título" do Issue Forms.

    IMPORTANTE:
    - Issue Forms renderiza labels como headings: "### SKU (único)"
    - então aceitamos prefixo opcional de heading.

    Exemplo:
      ### Título
      Mochila impermeável — Notebook 15.6"
    """
    if not body:
        return ""

    # aceita prefixo "### " e variações
    pattern = rf"(?ims)^\s*(?:#+\s*)?{label_regex}\s*$\n+([^\n]+)"
    m = re.search(pattern, body)
    if not m:
        return ""

    value = (m.group(1) or "").strip()

    # evita placeholders comuns
    if value.lower() in {"_", "-", "n/a", "na", "none", "null"}:
        return ""
    return value


def _extract_first_url_under_label(body: str, label_regex: str) -> str:
    """
    Pega a primeira URL na linha abaixo do label (ou na mesma linha em casos raros).
    """
    v = _extract_field(body, label_regex)
    if v.startswith("http://") or v.startswith("https://"):
        return v.strip()

    # fallback: tenta achar URL perto do label (na linha capturada)
    pattern = rf"(?ims)^\s*(?:#+\s*)?{label_regex}\s*$\n+([^\n]+)"
    m = re.search(pattern, body)
    if not m:
        return ""

    chunk = (m.group(1) or "").strip()
    um = re.search(r"(https?://\S+)", chunk)
    return um.group(1).strip() if um else ""


def _extract_markdown_image_url(body: str) -> str:
    """
    Markdown clássico:
      ![alt](https://github.com/user-attachments/assets/....)
    """
    if not body:
        return ""
    urls = re.findall(r"!\[[^\]]*\]\((https?://[^)\s]+)\)", body, flags=re.IGNORECASE)
    return urls[0].strip() if urls else ""


def _extract_html_image_url(body: str) -> str:
    """
    Issue pode guardar imagem como HTML:
      <img ... src="https://github.com/user-attachments/assets/...." />
    """
    if not body:
        return ""
    m = re.search(r'(?is)<img[^>]+src="(https?://[^"]+)"', body)
    return m.group(1).strip() if m else ""


def _split_badges_optional(raw: str) -> Optional[List[str]]:
    if not raw or not raw.strip():
        return None
    parts = [p.strip() for p in raw.split(",")]
    seen = set()
    out: List[str] = []
    for p in parts:
        if not p:
            continue
        key = p.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(p)
    return out


def _checkbox_state(body: str, text_regex: str) -> Optional[bool]:
    """
    Retorna:
      True  -> se achar "- [x] Texto"
      False -> se achar "- [ ] Texto"
      None  -> se não achar o item

    Aceita '-' ou '*'.
    Case-insensitive.
    """
    if not body:
        return None

    # checked
    if re.search(rf"(?im)^\s*[-*]\s*\[x\]\s*{text_regex}\b", body):
        return True

    # unchecked
    if re.search(rf"(?im)^\s*[-*]\s*\[\s\]\s*{text_regex}\b", body):
        return False

    return None


def _normalize_asset_path(p: str) -> str:
    if not p:
        return ""

    # URL externa fica como está
    if p.startswith("http://") or p.startswith("https://"):
        return p.strip()

    # normaliza separadores
    p2 = p.strip().replace("\\", "/").lstrip("./").lstrip("/")

    # corrige bug clássico: assets/assets/...
    p2 = p2.replace("assets/assets/", "assets/")

    # normaliza possível variação de pasta (products -> produtos)
    p2 = p2.replace("assets/products/", "assets/produtos/")

    return p2


def _ml_search_url(query: str) -> str:
    """
    Link estável de busca no Mercado Livre.
    Ex: https://lista.mercadolivre.com.br/5J5PKG-EN33
    """
    q = (query or "").strip()
    if not q:
        return ""
    slug = quote_plus(q).replace("+", "-")
    return f"https://lista.mercadolivre.com.br/{slug}"


def _build_product_from_issue(issue: Dict[str, Any]) -> Dict[str, Any]:
    body = (issue.get("body") or "").strip()
    labels = [l.get("name", "") for l in (issue.get("labels") or []) if isinstance(l, dict)]
    labels_lc = {x.lower() for x in labels if x}

    # Issue Forms: labels vêm como "### SKU (único)" etc.
    sku = _extract_field(body, r"SKU\b.*")
    title = _extract_field(body, r"T[ií]tulo\b.*")
    badges_raw = _extract_field(body, r"Badges/Tags\b.*|Badges\b.*|Tags\b.*")
    id_busca = _extract_field(body, r"ID\s+Mercado\s+Livre\b.*")
    link_ml = _extract_first_url_under_label(body, r"Link\s+Mercado\s+Livre\b.*")
    image_url = _extract_first_url_under_label(body, r"Imagem\b\s*\(URL\s+opcional\)\s*.*")

    # imagem fallback
    if not image_url:
        image_url = _extract_markdown_image_url(body)
    if not image_url:
        image_url = _extract_html_image_url(body)

    badges = _split_badges_optional(badges_raw)

    # checkbox robusto (x / vazio)
    active_state = _checkbox_state(body, r"Ativo")
    featured_state = _checkbox_state(body, r"Definir\s+como\s+Produto\s+do\s+Dia|featured|Produto\s+do\s+Dia")

    # Sem a seção de opções (templates antigos): default ativo
    if active_state is None:
        active = True
    else:
        active = bool(active_state)

    featured = bool(featured_state) if featured_state is not None else False

    # normalizações (SEM mexer em case de URL)
    link_ml = (link_ml or "").strip()
    image = _normalize_asset_path(image_url)

    # Open URL:
    # - Se tiver link do ML, usa exatamente como foi colado (preserva /sec e case)
    # - Se não tiver link, usa busca por ID
    open_url = link_ml or _ml_search_url(id_busca)

    # check_url (monitoramento) — por enquanto, igual ao link original se existir
    check_url = link_ml or open_url

    # fallback mínimo de title/sku se vier vazio
    if not title:
        title = (issue.get("title") or "").strip()

    # Se SKU não foi lido, isso é erro (Issue Forms exige SKU).
    # Melhor falhar do que gerar produto quebrado sem link/id.
    if not sku:
        raise ValueError("Não consegui ler o campo SKU do Issue (provável mismatch de template/regex).")

    # validação mínima de link/id
    if not open_url:
        raise ValueError("Produto sem link: preencha 'Link Mercado Livre' ou 'ID Mercado Livre'.")

    # Caso seja o issue especial do "produto do dia"
    special_set_featured_only = ("cms-produto-do-dia" in labels_lc) and (not badges) and (not link_ml) and (not image)

    product: Dict[str, Any] = {
        "sku": sku,
        "title": title,
        "badges": badges,  # None = não sobrescreve
        "id_busca": id_busca,
        "open_url": open_url,
        "check_url": check_url,
        "image": image,
        # não sobrescrever price_text se vier vazio (mantém o que já existir)
        "price_text": None,
        "active": bool(active),
        "featured": bool(featured),
        "last_checked": "",
        "last_ok": "",
        "_special_set_featured_only": bool(special_set_featured_only),
    }
    return product


def _upsert_product(data: Dict[str, Any], incoming: Dict[str, Any]) -> Dict[str, Any]:
    products: List[Dict[str, Any]] = data.get("products") or []
    if not isinstance(products, list):
        products = []

    sku = (incoming.get("sku") or "").strip()
    if not sku:
        return data

    # encontra existente por SKU
    idx = next((i for i, p in enumerate(products) if isinstance(p, dict) and (p.get("sku") == sku)), None)

    if idx is None:
        existing: Dict[str, Any] = {}
        products.append(existing)
        idx = len(products) - 1
    else:
        existing = products[idx] if isinstance(products[idx], dict) else {}
        products[idx] = existing

    # preserva campos de monitoramento se já existirem
    preserve_keys = {"last_checked", "last_ok"}
    for k in preserve_keys:
        if k in existing and (not incoming.get(k)):
            incoming[k] = existing.get(k, "")

    # normaliza image novamente (garante sem assets/assets)
    if incoming.get("image"):
        incoming["image"] = _normalize_asset_path(incoming.get("image", ""))

    # remove flag interna
    special_set_featured_only = bool(incoming.pop("_special_set_featured_only", False))

    if special_set_featured_only:
        for p in products:
            if not isinstance(p, dict):
                continue
            p["featured"] = bool(p.get("sku") == sku)
        data["products"] = products
        return data

    for k, v in incoming.items():
        # ESSENCIAIS: sempre sobrescreve
        if k in {"sku", "title", "open_url", "check_url", "image", "active", "featured", "id_busca"}:
            if v is None and k not in {"id_busca"}:
                continue
            existing[k] = v
            continue

        # price_text: NÃO sobrescreve com vazio/None
        if k == "price_text":
            if v is None:
                continue
            if isinstance(v, str) and v.strip() == "":
                continue
            existing[k] = v
            continue

        # badges: se vier None, preserva o que já existe
        if k == "badges":
            if v is None:
                continue
            existing[k] = v
            continue

        if v is None:
            continue
        if isinstance(v, str) and v.strip() == "":
            continue

        existing[k] = v

    # defaults
    existing.setdefault("badges", [])
    existing.setdefault("price_text", "")
    existing.setdefault("last_checked", "")
    existing.setdefault("last_ok", "")
    existing.setdefault("active", True)
    existing.setdefault("featured", False)

    # se marcou featured, desmarca os outros
    if existing.get("featured") is True:
        for p in products:
            if not isinstance(p, dict):
                continue
            if p.get("sku") != sku:
                p["featured"] = False

    data["products"] = products
    return data


def main() -> int:
    event_path = os.environ.get("GITHUB_EVENT_PATH") or ""
    if not event_path or not Path(event_path).exists():
        print("ERRO: GITHUB_EVENT_PATH não encontrado.")
        return 2

    with open(event_path, "r", encoding="utf-8") as f:
        event = json.load(f)

    issue = event.get("issue") or {}
    if not issue:
        print("Nada a fazer: payload sem 'issue'.")
        return 0

    try:
        incoming = _build_product_from_issue(issue)
    except Exception as e:
        print(f"ERRO: {e}")
        return 3

    data = _read_json(PRODUTOS_JSON)
    data = _upsert_product(data, incoming)
    data["updated_at"] = _utc_now_iso_z()

    _write_json(PRODUTOS_JSON, data)

    print("OK: produtos.json atualizado.")
    print(f"SKU: {incoming.get('sku')}")
    print(f"Featured: {incoming.get('featured')}")
    print(f"Active: {incoming.get('active')}")
    print(f"Open URL: {incoming.get('open_url')}")
    print(f"ID Busca: {incoming.get('id_busca')}")
    print(f"Image: {incoming.get('image')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
