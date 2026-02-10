# ==========================================================
# Arquivo: tools/cms_produtos.py
# Módulo : CMS Produtos — Issue -> produtos.json (gh-pages)
# Versão : v4 (Sanitiza HTML/IMG + valida SKU + limpa corrompidos + URL regex melhor)
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

# Aceita hífen e underscore (pra não matar SKU antigo).
SKU_RE = re.compile(r"^[a-z0-9][a-z0-9\-_]{2,80}$", re.IGNORECASE)

# URL sem capturar aspas/fechamentos comuns
URL_RE = re.compile(r"(https?://[^\s\"')>]+)", re.IGNORECASE)


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


def _clean_text_value(v: str) -> str:
    v = (v or "").strip()
    # remove aspas extras comuns quando cola em alguns editores
    v = v.strip().strip('"').strip("'").strip()
    return v


def _looks_like_html(v: str) -> bool:
    s = (v or "").strip()
    if not s:
        return False
    sl = s.lower()
    if "<img" in sl:
        return True
    if sl.startswith("<") and ">" in sl[:200]:
        return True
    if "<script" in sl or "<style" in sl:
        return True
    return False


def _first_url_in_text(text: str) -> str:
    if not text:
        return ""
    m = URL_RE.search(text)
    return m.group(1).strip() if m else ""


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

    pattern = rf"(?ims)^\s*(?:#+\s*)?{label_regex}\s*$\n+([^\n]+)"
    m = re.search(pattern, body)
    if not m:
        return ""

    value = _clean_text_value(m.group(1) or "")

    # evita placeholders comuns
    if value.lower() in {"_", "-", "n/a", "na", "none", "null"}:
        return ""

    # Se vier HTML (ex.: <img ...>), NÃO é um valor válido para campo.
    if _looks_like_html(value):
        return ""

    return value


def _extract_first_url_under_label(body: str, label_regex: str) -> str:
    """
    Pega a primeira URL na linha abaixo do label (ou tenta extrair de HTML colado).
    """
    v = _extract_field(body, label_regex)
    u = _first_url_in_text(v)
    if u:
        return u

    # fallback: tenta achar o "chunk" logo abaixo do label e extrair URL dali
    pattern = rf"(?ims)^\s*(?:#+\s*)?{label_regex}\s*$\n+([^\n]+)"
    m = re.search(pattern, body)
    if not m:
        return ""

    chunk = _clean_text_value(m.group(1) or "")
    return _first_url_in_text(chunk)


def _extract_markdown_image_url(body: str) -> str:
    """
    Markdown clássico:
      ![alt](https://github.com/user-attachments/assets/....)
    """
    if not body:
        return ""
    urls = re.findall(r"!\[[^\]]*\]\((https?://[^)\s]+)\)", body, flags=re.IGNORECASE)
    if not urls:
        return ""
    # sanitiza via URL_RE para evitar lixo
    return _first_url_in_text(urls[0].strip())


def _extract_html_image_url(body: str) -> str:
    """
    Issue pode guardar imagem como HTML:
      <img ... src="https://github.com/user-attachments/assets/...." />
    """
    if not body:
        return ""
    # pega o primeiro src=""
    m = re.search(r'(?is)<img[^>]+src="(https?://[^"]+)"', body)
    if not m:
        return ""
    return _first_url_in_text(m.group(1).strip())


def _split_badges_optional(raw: str) -> Optional[List[str]]:
    if not raw or not raw.strip():
        return None
    if _looks_like_html(raw):
        return None
    parts = [p.strip() for p in raw.split(",")]
    seen = set()
    out: List[str] = []
    for p in parts:
        if not p:
            continue
        if _looks_like_html(p):
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
    """
    if not body:
        return None

    if re.search(rf"(?im)^\s*[-*]\s*\[x\]\s*{text_regex}\b", body):
        return True

    if re.search(rf"(?im)^\s*[-*]\s*\[\s\]\s*{text_regex}\b", body):
        return False

    return None


def _normalize_asset_path(p: str) -> str:
    if not p:
        return ""

    p = _clean_text_value(p)

    # Se vier HTML inteiro por algum motivo, tenta extrair URL
    if _looks_like_html(p):
        u = _first_url_in_text(p)
        return u.strip() if u else ""

    # URL externa fica como está
    if p.startswith("http://") or p.startswith("https://"):
        return p.strip()

    # normaliza separadores
    p2 = p.replace("\\", "/").lstrip("./").lstrip("/")

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
    if not q or _looks_like_html(q):
        return ""
    slug = quote_plus(q).replace("+", "-")
    return f"https://lista.mercadolivre.com.br/{slug}"


def _is_valid_sku(sku: str) -> bool:
    s = (sku or "").strip()
    if not s:
        return False
    if _looks_like_html(s):
        return False
    return bool(SKU_RE.match(s))
def _build_product_from_issue(issue: Dict[str, Any]) -> Dict[str, Any]:
    body = (issue.get("body") or "").strip()
    labels = [l.get("name", "") for l in (issue.get("labels") or []) if isinstance(l, dict)]
    labels_lc = {x.lower() for x in labels if x}

    sku_raw = _extract_field(body, r"SKU\b.*")
    title_raw = _extract_field(body, r"T[ií]tulo\b.*")
    badges_raw = _extract_field(body, r"Badges/Tags\b.*|Badges\b.*|Tags\b.*")
    id_busca_raw = _extract_field(body, r"ID\s+Mercado\s+Livre\b.*")
    link_ml_raw = _extract_first_url_under_label(body, r"Link\s+Mercado\s+Livre\b.*")
    image_url = _extract_first_url_under_label(body, r"Imagem\b\s*\(URL\s+opcional\)\s*.*")

    # imagem fallback: markdown / html (drag-drop)
    if not image_url:
        image_url = _extract_markdown_image_url(body)
    if not image_url:
        image_url = _extract_html_image_url(body)

    badges = _split_badges_optional(badges_raw)

    # checkbox robusto
    active_state = _checkbox_state(body, r"Ativo")
    featured_state = _checkbox_state(body, r"Definir\s+como\s+Produto\s+do\s+Dia|featured|Produto\s+do\s+Dia")

    active = True if active_state is None else bool(active_state)
    featured = bool(featured_state) if featured_state is not None else False

    sku = _clean_text_value(sku_raw).lower()
    title = _clean_text_value(title_raw)
    id_busca = _clean_text_value(id_busca_raw)

    # Se título vier vazio, fallback no título do issue
    if not title:
        title = _clean_text_value(issue.get("title") or "")

    # Proteções anti-HTML
    if _looks_like_html(title):
        title = ""
    if _looks_like_html(id_busca):
        id_busca = ""

    # validação SKU (obrigatório)
    if not sku:
        raise ValueError("Não consegui ler o campo SKU do Issue (provável mismatch de template/regex).")
    if not _is_valid_sku(sku):
        raise ValueError(f"SKU inválido: '{sku}'. Use apenas letras/números e '-' ou '_' (ex: power-bank-20000mah-225w-usbc).")

    link_ml = (link_ml_raw or "").strip()
    if _looks_like_html(link_ml):
        link_ml = _first_url_in_text(link_ml)  # tenta salvar caso venha HTML
    if link_ml and not (link_ml.startswith("http://") or link_ml.startswith("https://")):
        # se não for URL válida, tenta extrair
        link_ml = _first_url_in_text(link_ml)

    image = _normalize_asset_path(image_url)

    # Open URL:
    open_url = link_ml or _ml_search_url(id_busca)
    if not open_url:
        raise ValueError("Produto sem link: preencha 'Link Mercado Livre' (URL) ou 'ID Mercado Livre'.")

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

    # LIMPA automaticamente produtos corrompidos (SKU HTML / inválida)
    cleaned: List[Dict[str, Any]] = []
    removed = 0
    for p in products:
        if not isinstance(p, dict):
            removed += 1
            continue
        sku_old = _clean_text_value(str(p.get("sku", "") or "")).lower()
        if not _is_valid_sku(sku_old):
            removed += 1
            continue
        p["sku"] = sku_old
        cleaned.append(p)
    products = cleaned
    if removed:
        print(f"INFO: removidos {removed} produto(s) corrompido(s) do produtos.json.")

    sku = (incoming.get("sku") or "").strip().lower()
    if not sku:
        return data
    if not _is_valid_sku(sku):
        raise ValueError(f"SKU inválido no incoming: '{sku}'")

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

    # normaliza image novamente
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
        if k in {"sku", "title", "open_url", "check_url", "image", "active", "featured", "id_busca"}:
            if v is None and k not in {"id_busca"}:
                continue
            # proteções anti-HTML para campos críticos
            if isinstance(v, str) and _looks_like_html(v):
                continue
            existing[k] = v
            continue

        if k == "price_text":
            if v is None:
                continue
            if isinstance(v, str) and v.strip() == "":
                continue
            existing[k] = v
            continue

        if k == "badges":
            if v is None:
                continue
            existing[k] = v
            continue

        if v is None:
            continue
        if isinstance(v, str) and v.strip() == "":
            continue
        if isinstance(v, str) and _looks_like_html(v):
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
