# ==========================================================
# Arquivo: tools/cms_produtos.py
# Módulo : CMS Produtos — Issue -> produtos.json (gh-pages)
# Versão : v4 (Parser por seções ### + Sanitização forte + URL sem aspas + Auto-clean inválidos)
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

_URL_RE = re.compile(r"(https?://[^\s<>\")']+)", re.IGNORECASE)


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


def _strip_html(s: str) -> str:
    if not s:
        return ""
    # remove tags HTML
    s2 = re.sub(r"(?is)<[^>]+>", " ", s)
    # normaliza espaços
    s2 = re.sub(r"\s+", " ", s2).strip()
    return s2


def _is_placeholder(v: str) -> bool:
    x = (v or "").strip().lower()
    return x in {"_", "-", "n/a", "na", "none", "null"}


def _clean_url(u: str) -> str:
    if not u:
        return ""
    # tira aspas/parenteses e lixo de fim (muito comum em src="...").
    x = (u or "").strip()
    x = x.strip().strip('"').strip("'")
    x = re.sub(r"""[)"'\s]+$""", "", x)
    return x.strip()


def _first_url(text: str) -> str:
    if not text:
        return ""
    m = _URL_RE.search(text)
    return _clean_url(m.group(1)) if m else ""


def _first_meaningful_line(block: str) -> str:
    if not block:
        return ""
    for ln in (block or "").splitlines():
        t = (ln or "").strip()
        if not t:
            continue
        if _is_placeholder(t):
            continue
        return t
    return ""


def _parse_sections(body: str) -> Dict[str, str]:
    """
    Parse por headings (Issue Forms):
      ### SKU (único)
      valor

    Guarda o conteúdo até o próximo heading.
    """
    if not body:
        return {}

    sections: Dict[str, str] = {}
    current: Optional[str] = None
    buf: List[str] = []

    for line in body.splitlines():
        m = re.match(r"^\s*#{2,6}\s*(.+?)\s*$", line)
        if m:
            if current is not None:
                sections[current] = "\n".join(buf).strip()
            current = (m.group(1) or "").strip()
            buf = []
        else:
            if current is not None:
                buf.append(line)

    if current is not None:
        sections[current] = "\n".join(buf).strip()

    return sections


def _get_section(sections: Dict[str, str], label_regex: str) -> str:
    """
    Encontra a PRIMEIRA seção cujo título bate com label_regex.
    """
    if not sections:
        return ""
    rgx = re.compile(label_regex, re.IGNORECASE)
    for title, content in sections.items():
        if rgx.search(title or ""):
            return content or ""
    return ""


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
    x = _clean_url(p)

    # URL externa fica como está
    if x.startswith("http://") or x.startswith("https://"):
        return x.strip()

    # normaliza separadores
    x2 = x.strip().replace("\\", "/").lstrip("./").lstrip("/")

    # corrige bug clássico: assets/assets/...
    x2 = re.sub(r"(?i)^assets/assets/", "assets/", x2)

    # normaliza possível variação de pasta (products -> produtos)
    x2 = re.sub(r"(?i)^assets/products/", "assets/produtos/", x2)

    return x2


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


def _looks_like_html_blob(s: str) -> bool:
    if not s:
        return False
    x = s.strip().lower()
    return ("<img" in x) or ("</" in x) or ("<" in x and ">" in x)


def _clean_title(s: str) -> str:
    x = _strip_html(s or "")
    x = re.sub(r"\s+", " ", x).strip()
    return x


def _clean_sku(s: str) -> str:
    """
    SKU “slug”: letras/números/hífen. Se vier lixo/HTML, deixa vazio e força erro.
    """
    raw = (s or "").strip()
    raw2 = _strip_html(raw)

    if not raw2:
        return ""
    if _looks_like_html_blob(raw):
        return ""

    x = raw2.lower()
    x = re.sub(r"[^a-z0-9]+", "-", x)
    x = re.sub(r"-{2,}", "-", x).strip("-")
    return x


def _clean_ml_id(s: str) -> str:
    """
    Mantém padrão tipo 5J5PKG-EN33 (A-Z0-9-). Se vier HTML, zera.
    """
    raw = (s or "").strip()
    if _looks_like_html_blob(raw):
        return ""
    x = _strip_html(raw).upper().strip()
    x = re.sub(r"[^A-Z0-9-]", "", x)
    return x


def _is_ml_url(u: str) -> bool:
    x = (u or "").lower()
    return ("mercadolivre" in x) or ("lista.mercadolivre" in x)


def _sanitize_existing_products(products: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Remove itens claramente inválidos (ex.: sku/title com <img ...>, open_url apontando pra github).
    Também limpa aspas no final de URLs.
    """
    out: List[Dict[str, Any]] = []
    seen = set()

    for p in (products or []):
        if not isinstance(p, dict):
            continue

        raw_sku = str(p.get("sku") or "").strip()
        if not raw_sku:
            continue
        if _looks_like_html_blob(raw_sku):
            continue

        # não altera sku bom; só bloqueia os “lixos”
        sku = raw_sku.strip()
        if sku in seen:
            continue

        title = _clean_title(str(p.get("title") or ""))
        if not title or _looks_like_html_blob(title):
            continue

        open_url = _clean_url(str(p.get("open_url") or ""))
        check_url = _clean_url(str(p.get("check_url") or "")) or open_url

        # se open_url não for ML, tenta reconstruir via ID; se não der, remove
        if open_url and not _is_ml_url(open_url):
            id_busca = _clean_ml_id(str(p.get("id_busca") or ""))
            open_url = _ml_search_url(id_busca) if id_busca else ""

        if not open_url:
            continue

        p["sku"] = sku
        p["title"] = title
        p["open_url"] = open_url
        p["check_url"] = check_url or open_url
        p["image"] = _normalize_asset_path(str(p.get("image") or ""))

        # defaults mínimos
        p.setdefault("badges", [])
        p.setdefault("price_text", "")
        p.setdefault("last_checked", "")
        p.setdefault("last_ok", "")
        p.setdefault("active", True)
        p.setdefault("featured", False)

        out.append(p)
        seen.add(sku)

    return out


def _build_product_from_issue(issue: Dict[str, Any]) -> Dict[str, Any]:
    body = (issue.get("body") or "").strip()
    sections = _parse_sections(body)

    labels = [l.get("name", "") for l in (issue.get("labels") or []) if isinstance(l, dict)]
    labels_lc = {x.lower() for x in labels if x}

    sku_raw = _first_meaningful_line(_get_section(sections, r"^SKU\b"))
    title_raw = _first_meaningful_line(_get_section(sections, r"^T[ií]tulo\b"))
    badges_raw = _first_meaningful_line(_get_section(sections, r"Badges/Tags|Badges|Tags"))
    id_raw = _first_meaningful_line(_get_section(sections, r"ID\s+Mercado\s+Livre|ID\s+ML|ID\b"))
    link_block = _get_section(sections, r"Link\s+Mercado\s+Livre|Link\s+ML|Link\b")
    img_block = _get_section(sections, r"Imagem\b")

    # URLs: aceita colado puro OU dentro de <img ... src="...">
    link_ml = _first_url(link_block) or _first_url(_first_meaningful_line(link_block))
    image_url = _first_url(img_block) or _first_url(_first_meaningful_line(img_block))

    # fallback imagem: pega do body inteiro (markdown/html)
    if not image_url:
        image_url = _first_url(body)

    sku = _clean_sku(sku_raw)
    title = _clean_title(title_raw)
    id_busca = _clean_ml_id(id_raw)

    badges = _split_badges_optional(_clean_title(badges_raw))

    # checkbox robusto (x / vazio)
    active_state = _checkbox_state(body, r"Ativo")
    featured_state = _checkbox_state(body, r"Definir\s+como\s+Produto\s+do\s+Dia|featured|Produto\s+do\s+Dia")

    # Sem a seção de opções (templates antigos): default ativo
    active = True if active_state is None else bool(active_state)
    featured = bool(featured_state) if featured_state is not None else False

    # fallback mínimo de title se vier vazio
    if not title:
        title = (issue.get("title") or "").strip()

    # validações fortes (pra não gerar lixo no JSON)
    if not sku:
        raise ValueError("Não consegui ler um SKU válido. (Evite colar imagem/HTML no campo SKU.)")

    if not link_ml and not id_busca:
        raise ValueError("Produto sem link: preencha 'Link Mercado Livre' ou 'ID Mercado Livre'.")

    if link_ml and not _is_ml_url(link_ml):
        raise ValueError("O 'Link Mercado Livre' precisa ser do Mercado Livre (ex.: https://mercadolivre.com/sec/... ).")

    # Open URL:
    # - Se tiver link do ML, usa exatamente como foi colado (preserva /sec e case)
    # - Se não tiver link, usa busca por ID
    open_url = _clean_url(link_ml) if link_ml else _ml_search_url(id_busca)
    check_url = open_url  # por enquanto igual

    image = _normalize_asset_path(image_url)

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
        "price_text": None,  # não sobrescreve com vazio
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

    # ✅ limpa o que já existe (remove itens “<img ...>” e URLs com aspas)
    products = _sanitize_existing_products(products)

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

    # normaliza image novamente (garante sem assets/assets e sem aspas)
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
