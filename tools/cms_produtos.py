# ==========================================================
# Arquivo: tools/cms_produtos.py
# Módulo : CMS Produtos — Issue -> produtos.json (gh-pages)
# Versão : v4 (Parser por seção ### + Anti-DOTALL + Sanitização + Auto-clean produtos corrompidos)
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


# =========================
# TIME / JSON
# =========================
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


# =========================
# EXTRAÇÃO ROBUSTA (Issue Forms)
# =========================
def _first_http_url(text: str) -> str:
    if not text:
        return ""
    m = re.search(r"(https?://[^\s<>\"]+)", text.strip(), flags=re.IGNORECASE)
    return m.group(1).strip() if m else ""


def _extract_markdown_image_url(text: str) -> str:
    """
    Markdown clássico:
      ![alt](https://github.com/user-attachments/assets/....)
    """
    if not text:
        return ""
    urls = re.findall(r"!\[[^\]]*\]\((https?://[^)\s]+)\)", text, flags=re.IGNORECASE)
    return urls[0].strip() if urls else ""


def _extract_html_image_url(text: str) -> str:
    """
    Issue pode guardar imagem como HTML:
      <img ... src="https://github.com/user-attachments/assets/...." />
    """
    if not text:
        return ""
    m = re.search(r'(?is)<img[^>]+src="(https?://[^"]+)"', text)
    return m.group(1).strip() if m else ""


def _extract_section(body: str, heading_regex: str) -> str:
    """
    Extrai o bloco de conteúdo logo após um heading do Issue Forms.

    Padrão do GitHub Issue Forms:
      ### Campo
      valor (pode ser multi-linha)

    Este parser:
    - acha a heading (linha inteira)
    - captura tudo até a próxima heading (### ...) ou fim do texto
    """
    if not body:
        return ""

    # NOTE: heading_regex NÃO pode usar ".*" (porque com DOTALL atravessa linhas).
    # Use sempre algo como r"SKU\\b[^\\n]*" etc.
    pattern = rf"(?ims)^\s*(?:#+\s*)?{heading_regex}\s*$\n(.*?)(?=^\s*(?:#+\s*)|\Z)"
    m = re.search(pattern, body)
    if not m:
        return ""

    return (m.group(1) or "").strip()


def _extract_field(body: str, heading_regex: str) -> str:
    """
    Pega o primeiro conteúdo "útil" (primeira linha não vazia) da seção.
    """
    section = _extract_section(body, heading_regex)
    if not section:
        return ""

    # pega primeira linha não vazia e ignora formatação comum
    for line in section.splitlines():
        v = (line or "").strip()
        if not v:
            continue
        if v in {"```", "```md", "```markdown", "```text"}:
            continue
        if v.lower() in {"_", "-", "n/a", "na", "none", "null"}:
            return ""
        return v

    return ""


def _extract_first_url_under_heading(body: str, heading_regex: str) -> str:
    """
    Pega a primeira URL dentro da seção (linha abaixo do heading, ou em qualquer linha do bloco).
    """
    section = _extract_section(body, heading_regex)
    if not section:
        return ""
    return _first_http_url(section)


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

    if re.search(rf"(?im)^\s*[-*]\s*\[x\]\s*{text_regex}\b", body):
        return True

    if re.search(rf"(?im)^\s*[-*]\s*\[\s\]\s*{text_regex}\b", body):
        return False

    return None


# =========================
# NORMALIZAÇÃO / VALIDAÇÃO
# =========================
def _normalize_asset_path(p: str) -> str:
    """
    Aceita:
    - URL direta
    - tag <img ... src="URL">
    - markdown image ![](...)
    - caminho relativo

    Retorna URL (se for URL) ou path relativo normalizado.
    """
    if not p:
        return ""

    raw = p.strip()

    # Se veio um <img ...>, extrai src
    if "<img" in raw.lower():
        u = _extract_html_image_url(raw)
        return u.strip() if u else ""

    # Se veio markdown image
    if "![" in raw and "](" in raw:
        u = _extract_markdown_image_url(raw)
        return u.strip() if u else ""

    # Se veio algum texto com URL, pega a primeira
    u = _first_http_url(raw)
    if u:
        return u.strip()

    # caso contrário, é path relativo
    p2 = raw.replace("\\", "/").lstrip("./").lstrip("/")

    # corrige bug clássico: assets/assets/...
    p2 = p2.replace("assets/assets/", "assets/")

    # normaliza possível variação de pasta (products -> produtos)
    p2 = p2.replace("assets/products/", "assets/produtos/")

    return p2


def _ml_search_url(query: str) -> str:
    """
    Link estável de busca no Mercado Livre.
    Ex: https://lista.mercadolivre.com.br/5J5PKG-H0JA
    """
    q = (query or "").strip()
    if not q:
        return ""
    slug = quote_plus(q).replace("+", "-")
    return f"https://lista.mercadolivre.com.br/{slug}"


def _looks_like_ml_url(url: str) -> bool:
    if not url:
        return False
    u = url.strip().lower()
    return ("mercadolivre.com" in u) or ("mercadolivre.com.br" in u) or ("ml.com" in u)


def _looks_corrupt_value(v: str) -> bool:
    if not v:
        return False
    s = v.strip().lower()
    if s.startswith("<") or "<img" in s or "</" in s:
        return True
    if "github.com/user-attachments" in s and not s.startswith("http"):
        return True
    return False


def _looks_corrupt_product(p: Dict[str, Any]) -> bool:
    sku = (p.get("sku") or "").strip()
    if not sku:
        return True
    if _looks_corrupt_value(sku):
        return True
    if "http://" in sku.lower() or "https://" in sku.lower():
        return True
    if len(sku) > 160:
        return True

    open_url = (p.get("open_url") or "").strip().lower()
    if open_url and "github.com/user-attachments" in open_url:
        return True

    return False
def _build_product_from_issue(issue: Dict[str, Any]) -> Dict[str, Any]:
    body = (issue.get("body") or "").strip()
    labels = [l.get("name", "") for l in (issue.get("labels") or []) if isinstance(l, dict)]
    labels_lc = {x.lower() for x in labels if x}

    # Campos (Issue Forms)
    # IMPORTANTE: heading_regex NÃO usa ".*" pra não atravessar linhas
    sku = _extract_field(body, r"SKU\b[^\n]*")
    title = _extract_field(body, r"T[ií]tulo\b[^\n]*")
    badges_raw = _extract_field(body, r"Badges/Tags\b[^\n]*|Badges\b[^\n]*|Tags\b[^\n]*")
    id_busca = _extract_field(body, r"ID\s+Mercado\s+Livre\b[^\n]*")
    link_ml = _extract_first_url_under_heading(body, r"Link\s+Mercado\s+Livre\b[^\n]*")
    image_url = _extract_first_url_under_heading(body, r"Imagem\b\s*\(URL\s+opcional\)\s*[^\n]*")

    # imagem fallback: busca em qualquer lugar do body
    if not image_url:
        image_url = _extract_markdown_image_url(body)
    if not image_url:
        image_url = _extract_html_image_url(body)

    badges = _split_badges_optional(badges_raw)

    # checkbox robusto (x / vazio)
    active_state = _checkbox_state(body, r"Ativo")
    featured_state = _checkbox_state(body, r"Definir\s+como\s+Produto\s+do\s+Dia|featured|Produto\s+do\s+Dia")

    # Sem a seção de opções (templates antigos): default ativo
    active = True if active_state is None else bool(active_state)
    featured = bool(featured_state) if featured_state is not None else False

    # sanitizações
    sku = (sku or "").strip()
    title = (title or "").strip()
    id_busca = (id_busca or "").strip()
    link_ml = (link_ml or "").strip()

    # se link não parece ML, zera e usa busca por ID
    if link_ml and (not _looks_like_ml_url(link_ml)):
        link_ml = ""

    image = _normalize_asset_path(image_url)

    # fallback mínimo de title/sku se vier vazio
    if not title:
        title = (issue.get("title") or "").strip()

    # validações duras contra produto corrompido
    if not sku:
        raise ValueError("Não consegui ler o campo SKU do Issue (template/heading).")

    if _looks_corrupt_value(sku) or sku.lower().startswith("img "):
        raise ValueError("SKU corrompido (parece HTML/IMG). Verifique o Issue.")

    if title and _looks_corrupt_value(title):
        raise ValueError("Título corrompido (parece HTML/IMG). Verifique o Issue.")

    if id_busca and _looks_corrupt_value(id_busca):
        raise ValueError("ID Mercado Livre corrompido (parece HTML/IMG). Verifique o Issue.")

    # Open URL:
    # - Se tiver link do ML, usa exatamente como foi colado (preserva /sec e case)
    # - Se não tiver link, usa busca por ID
    open_url = link_ml or _ml_search_url(id_busca)

    # validação mínima de link/id
    if not open_url:
        raise ValueError("Produto sem link: preencha 'Link Mercado Livre' ou 'ID Mercado Livre'.")

    # check_url (monitoramento) — por enquanto, igual ao link original se existir
    check_url = link_ml or open_url

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
        "price_text": None,  # não sobrescrever com vazio
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

    # AUTO-LIMPEZA: remove produtos corrompidos antigos (SKU virado <img ...>)
    cleaned: List[Dict[str, Any]] = []
    removed = 0
    for p in products:
        if not isinstance(p, dict):
            removed += 1
            continue
        if _looks_corrupt_product(p):
            removed += 1
            continue
        cleaned.append(p)
    if removed:
        print(f"AVISO: removi {removed} item(ns) corrompido(s) do produtos.json.")

    products = cleaned

    sku = (incoming.get("sku") or "").strip()
    if not sku:
        data["products"] = products
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

    # normaliza image novamente (garante sem assets/assets e extrai src se vier <img>)
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
