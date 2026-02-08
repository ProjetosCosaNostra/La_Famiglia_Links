#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import json
import os
import re
import sys
import html as htmllib
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

ROOT = Path(__file__).resolve().parents[1]

CANDIDATE_JSON_PATHS = [
    ROOT / "produtos.json",
    ROOT / "assets" / "produtos.json",
    ROOT / "data" / "produtos.json",
    ROOT / "assets" / "data" / "produtos.json",
    ROOT / "assets" / "assets" / "produtos.json",
]

def gh_output_set(key: str, value: str) -> None:
    out_path = os.environ.get("GITHUB_OUTPUT")
    if not out_path:
        return
    with open(out_path, "a", encoding="utf-8") as f:
        f.write(f"{key}={value}\n")

def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()

def safe_strip(s: str | None) -> str:
    return (s or "").strip()

def fetch_html(url: str, timeout_sec: int = 25) -> str:
    req = Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari"
        },
    )
    with urlopen(req, timeout=timeout_sec) as resp:
        raw = resp.read()
    # Mercado Livre costuma estar em UTF-8, mas ignoramos erro para robustez
    return raw.decode("utf-8", errors="ignore")

def extract_meta(html: str, key: str) -> str:
    """
    Busca meta tags do tipo:
      <meta property="og:title" content="...">
      <meta name="og:title" content="...">
    """
    patterns = [
        rf'<meta[^>]+property="{re.escape(key)}"[^>]+content="([^"]+)"',
        rf"<meta[^>]+property='{re.escape(key)}'[^>]+content='([^']+)'",
        rf'<meta[^>]+name="{re.escape(key)}"[^>]+content="([^"]+)"',
        rf"<meta[^>]+name='{re.escape(key)}'[^>]+content='([^']+)'",
    ]
    for pat in patterns:
        m = re.search(pat, html, flags=re.IGNORECASE)
        if m:
            return htmllib.unescape(m.group(1)).strip()
    return ""

def extract_price_like(html: str) -> str:
    """
    Tenta achar um preço em metas comuns. Se não achar, retorna "".
    """
    # Alguns sites usam product:price:amount
    for key in ["product:price:amount", "og:price:amount"]:
        v = extract_meta(html, key)
        if v:
            return v

    # Fallback bem simples: procurar algo tipo "R$ 123,45" em trechos
    m = re.search(r"(R\$\s*\d{1,3}(?:\.\d{3})*(?:,\d{2})?)", html)
    if m:
        return m.group(1).strip()
    return ""

def parse_issue_body(body: str) -> dict:
    """
    Suporta 2 formatos:
    1) Issue Form (### Campo ... valor)
    2) Body simples tipo:
       SEC_URL: ...
       FEATURED: sim
       TITLE: ...
       PRICE: ...
       IMAGE: ...
       TAGS: ...
       SLUG: ...
    """
    data: dict[str, str] = {}

    # Formato 2 (chave: valor)
    kv = dict(re.findall(r"(?im)^(SEC_URL|FEATURED|TITLE|PRICE|IMAGE|TAGS|SLUG)\s*:\s*(.+)$", body))
    if kv:
        for k, v in kv.items():
            data[k.lower()] = v.strip()
        return data

    # Formato 1 (Issue Form)
    # Padrão: ### Label \n\n valor \n\n ### Next...
    chunks = re.split(r"\n###\s+", "\n" + body.strip())
    for ch in chunks:
        ch = ch.strip()
        if not ch:
            continue
        if ch.startswith("### "):
            ch = ch[4:]

        parts = ch.split("\n", 1)
        label = parts[0].strip().lower()
        value = parts[1].strip() if len(parts) > 1 else ""
        # remove linhas vazias iniciais
        value = re.sub(r"^\s*\n+", "", value).strip()

        # normaliza labels esperados
        if "link /sec" in label:
            data["sec_url"] = value.splitlines()[0].strip()
        elif "destaque" in label:
            data["featured"] = value.splitlines()[0].strip().lower()
        elif "título" in label or "titulo" in label:
            data["title"] = value.splitlines()[0].strip()
        elif "preço" in label or "preco" in label:
            data["price"] = value.splitlines()[0].strip()
        elif "imagem" in label:
            data["image"] = value.splitlines()[0].strip()
        elif "tags" in label:
            data["tags"] = "\n".join([ln.strip() for ln in value.splitlines() if ln.strip()])
        elif "id/slug" in label or "slug" in label:
            data["slug"] = value.splitlines()[0].strip()

    return data

def find_produtos_json() -> Path | None:
    for p in CANDIDATE_JSON_PATHS:
        if p.exists() and p.is_file():
            return p
    # fallback: procurar por nome
    for p in ROOT.rglob("produtos.json"):
        if ".git" in str(p):
            continue
        if ".github" in str(p):
            continue
        return p
    return None

def load_products_structure(obj):
    """
    Aceita:
    - list: [ {...}, {...} ]
    - dict com lista em: items/produtos/products
    Retorna: (container_dict_or_none, list_ref, key_name_or_empty)
    """
    if isinstance(obj, list):
        return (None, obj, "")

    if isinstance(obj, dict):
        for key in ["items", "produtos", "products"]:
            if key in obj and isinstance(obj[key], list):
                return (obj, obj[key], key)

        # se não tiver, cria "items"
        obj["items"] = []
        return (obj, obj["items"], "items")

    raise ValueError("Estrutura de JSON não suportada (esperado list ou dict com lista).")

def upsert_product(items: list, product: dict) -> tuple[bool, dict]:
    """
    Atualiza se achar por id ou link. Senão, insere no topo.
    Retorna: (changed, saved_product)
    """
    pid = product.get("id", "").strip()
    link = product.get("link", "").strip()

    for i, it in enumerate(items):
        if not isinstance(it, dict):
            continue
        if (pid and it.get("id") == pid) or (link and it.get("link") == link):
            # merge preservando campos existentes
            merged = dict(it)
            merged.update({k: v for k, v in product.items() if v not in [None, ""]})
            items[i] = merged
            return True, merged

    items.insert(0, product)
    return True, product

def main() -> int:
    event_path = os.environ.get("GITHUB_EVENT_PATH")
    if not event_path or not Path(event_path).exists():
        print("ERRO: GITHUB_EVENT_PATH não encontrado.")
        gh_output_set("changed", "0")
        return 0

    event = json.loads(Path(event_path).read_text(encoding="utf-8"))
    issue = event.get("issue", {})
    issue_number = issue.get("number")
    issue_body = safe_strip(issue.get("body"))
    issue_title = safe_strip(issue.get("title"))

    parsed = parse_issue_body(issue_body)
    sec_url = safe_strip(parsed.get("sec_url") or parsed.get("sec_url".lower()) or parsed.get("sec_url".upper()) or parsed.get("sec_url"))
    if not sec_url:
        # tenta formato 2 com SEC_URL:
        sec_url = safe_strip(parsed.get("sec_url")) or safe_strip(parsed.get("sec_url".lower()))
    if not sec_url:
        sec_url = safe_strip(parsed.get("sec_url"))  # redundante mas seguro

    # Formato KV
    if not sec_url:
        sec_url = safe_strip(parsed.get("sec_url")) or safe_strip(parsed.get("sec_url".lower()))
    if not sec_url:
        sec_url = safe_strip(parsed.get("sec_url"))

    # Se veio como "sec_url" no dict, ok; se veio como "sec_url" não, tenta "sec_url"
    if not sec_url:
        sec_url = safe_strip(parsed.get("sec_url"))

    # Para o formato KV:
    if not sec_url:
        sec_url = safe_strip(parsed.get("sec_url")) or safe_strip(parsed.get("sec_url".lower()))
    if not sec_url:
        sec_url = safe_strip(parsed.get("sec_url"))

    # Última tentativa: procurar URL /sec dentro do body
    if not sec_url:
        m = re.search(r"(https?://(?:www\.)?mercadolivre\.com/(?:sec|s)/[A-Za-z0-9]+)", issue_body)
        if m:
            sec_url = m.group(1).strip()

    if not sec_url:
        print("ERRO: não encontrei link /sec no Issue.")
        gh_output_set("changed", "0")
        return 0

    featured_raw = (parsed.get("featured") or parsed.get("featured".lower()) or "").strip().lower()
    is_featured = featured_raw in ["sim", "yes", "true", "1"]

    title_override = safe_strip(parsed.get("title") or parsed.get("title_override") or parsed.get("title_override".lower()))
    price_override = safe_strip(parsed.get("price") or parsed.get("price_override") or parsed.get("price_override".lower()))
    image_override = safe_strip(parsed.get("image") or parsed.get("image_override") or parsed.get("image_override".lower()))
    slug_override = safe_strip(parsed.get("slug") or parsed.get("slug_override") or parsed.get("slug_override".lower()))
    tags_raw = safe_strip(parsed.get("tags"))

    tags_list = [t.strip() for t in tags_raw.splitlines() if t.strip()] if tags_raw else []

    # Puxar dados do ML
    fetched_title = ""
    fetched_image = ""
    fetched_price = ""

    try:
        page = fetch_html(sec_url)
        fetched_title = extract_meta(page, "og:title")
        fetched_image = extract_meta(page, "og:image")
        fetched_price = extract_price_like(page)
    except (HTTPError, URLError) as e:
        print(f"AVISO: não consegui buscar metadata do link /sec ({e}). Vou usar overrides se existirem.")

    final_title = title_override or fetched_title or issue_title or "Produto"
    final_image = image_override or fetched_image
    final_price = price_override or fetched_price

    # ID do produto
    if slug_override:
        pid = slug_override
    else:
        date_tag = datetime.now(timezone.utc).strftime("%Y%m%d")
        pid = f"p{date_tag}-{issue_number}" if issue_number else f"p{date_tag}-x"

    produto = {
        "id": pid,
        "titulo": final_title,
        "link": sec_url,
        "img": final_image,
        "preco": final_price,
        "tags": tags_list,
        "featured": bool(is_featured),
        "updatedAt": now_iso(),
    }

    # Encontrar produtos.json
    json_path = find_produtos_json()
    if not json_path:
        print("ERRO: não achei produtos.json no repo.")
        gh_output_set("changed", "0")
        return 0

    raw = json_path.read_text(encoding="utf-8")
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        print("ERRO: produtos.json inválido (JSON quebrado).")
        gh_output_set("changed", "0")
        return 0

    container, items, key = load_products_structure(data)

    changed, saved = upsert_product(items, produto)

    # Se for destaque, opcionalmente desmarca outros
    if is_featured:
        for it in items:
            if isinstance(it, dict):
                it["featured"] = (it.get("id") == pid)
        # Também tenta setar um ponteiro se existir
        if isinstance(data, dict):
            data["featuredId"] = pid

    if changed:
        json_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    gh_output_set("changed", "1" if changed else "0")
    gh_output_set("json_path", str(json_path.relative_to(ROOT)))
    gh_output_set("product_id", saved.get("id", ""))
    gh_output_set("product_title", saved.get("titulo", ""))
    gh_output_set("commit_msg", f"chore: atualizar vitrine via issue #{issue_number}")

    print(f"OK: atualizado {json_path}")
    return 0

if __name__ == "__main__":
    sys.exit(main())
