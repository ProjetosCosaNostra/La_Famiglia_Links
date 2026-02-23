# ==========================================================
# Arquivo: tools/cms_produtos.py
# Módulo : CMS Produtos — Issue -> produtos.json (gh-pages)
# Versão : v8 (meli.la OK + canonical_url estável + check_url inteligente + dedupe robusto)
# ==========================================================

from __future__ import annotations

import json
import os
import re
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import quote_plus, urlparse


REPO_ROOT = Path(__file__).resolve().parents[1]
PRODUTOS_JSON = REPO_ROOT / "produtos.json"

# ✅ URL regex agora NÃO captura "\" no fim (evita https://...\" virar URL inválida)
_URL_RE = re.compile(r"(https?://[^\s<>\")'\\]+)", re.IGNORECASE)

# ✅ pega src= de <img ...>
_IMG_SRC_RE = re.compile(r"""(?is)<img[^>]+src\s*=\s*["']([^"']+)["']""")
# ✅ pega markdown ![alt](url)
_MD_IMG_RE = re.compile(r"""(?is)!\[[^\]]*]\(([^)]+)\)""")


# ===========================
# Mercado Livre: domínios aceitos
# ===========================
_ML_HOST_MARKERS = ("mercadolivre", "mercadolibre")

# short domains conhecidos do ML (ex.: meli.la)
_ML_SHORT_HOSTS = {"meli.la", "meli.co"}

# toggle (caso queira desligar resolução de shortlink sem quebrar o resto)
# CN_CMS_RESOLVE_SHORT=0 desliga
_RESOLVE_SHORT = os.getenv("CN_CMS_RESOLVE_SHORT", "1").strip().lower() not in {"0", "false", "no", "off"}

# timeout (segundos) para resolver shortlinks (quando habilitado)
_SHORT_TIMEOUT = float(os.getenv("CN_CMS_SHORT_TIMEOUT", "8.0") or "8.0")


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
    s2 = re.sub(r"(?is)<[^>]+>", " ", s)
    s2 = re.sub(r"\s+", " ", s2).strip()
    return s2


def _looks_like_html_blob(s: str) -> bool:
    if not s:
        return False
    x = s.strip().lower()
    return ("<img" in x) or ("</" in x) or ("<" in x and ">" in x)


def _is_placeholder(v: str) -> bool:
    x = (v or "").strip().lower()
    return x in {"_", "-", "n/a", "na", "none", "null"}


def _clean_url(u: str) -> str:
    """
    Remove aspas/parenteses/>/\ no fim (ex: ...\" ou ...") etc.
    """
    if not u:
        return ""

    x = str(u).strip()

    # remove aspas no começo
    while x and x[0] in {"'", '"', " "}:
        x = x[1:]

    # remove lixo no final (inclui "\" que aparecia como ...\")
    junk = {'"', "'", ")", "]", ">", "\\", " ", "\t", "\r", "\n"}
    while x and x[-1] in junk:
        x = x[:-1]

    return x.strip()


def _first_url(text: str) -> str:
    if not text:
        return ""
    m = _URL_RE.search(text)
    return _clean_url(m.group(1)) if m else ""


def _is_image_url(u: str) -> bool:
    if not u:
        return False
    x = (u or "").strip().lower()

    if x.startswith("data:image/"):
        return True

    # GitHub user-attachments (padrão do seu fluxo)
    if "github.com/user-attachments/assets/" in x:
        return True

    # extensões comuns (mesmo com querystring)
    if re.search(r"\.(png|jpg|jpeg|webp|gif)(\?.*)?$", x):
        return True

    return False


def _first_image_url(text: str) -> str:
    """
    Só retorna URL se realmente parecer imagem.
    Aceita:
      - <img src="...">
      - ![](url)
      - URL direta (se for imagem)
    """
    if not text:
        return ""

    m = _IMG_SRC_RE.search(text)
    if m:
        u = _clean_url(m.group(1))
        return u if _is_image_url(u) else ""

    m2 = _MD_IMG_RE.search(text)
    if m2:
        u = _clean_url(m2.group(1))
        return u if _is_image_url(u) else ""

    u3 = _first_url(text)
    return u3 if _is_image_url(u3) else ""


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
    if x.startswith("http://") or x.startswith("https://") or x.startswith("data:image/"):
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


def _clean_title(s: str) -> str:
    x = _strip_html(s or "")
    x = re.sub(r"\s+", " ", x).strip()
    return x


def _clean_sku(s: str) -> str:
    """
    SKU “slug”: letras/números/hífen.
    Se vier lixo/HTML, zera e força erro.
    """
    raw = (s or "").strip()
    if _looks_like_html_blob(raw):
        return ""

    raw2 = _strip_html(raw)
    if not raw2:
        return ""

    x = raw2.lower()
    x = re.sub(r"[^a-z0-9]+", "-", x)
    x = re.sub(r"-{2,}", "-", x).strip("-")
    return x


def _clean_ml_id(s: str) -> str:
    """
    Mantém padrão tipo 5J5PKG-EN33 (A-Z0-9-).
    Se vier HTML, zera.
    """
    raw = (s or "").strip()
    if _looks_like_html_blob(raw):
        return ""
    x = _strip_html(raw).upper().strip()
    x = re.sub(r"[^A-Z0-9-]", "", x)
    return x


def _host_of(u: str) -> str:
    """
    Extrai host normalizado (sem porta, sem credenciais, sem www).
    """
    try:
        pu = urlparse(u or "")
        host = (pu.netloc or "").strip().lower()
        if "@" in host:
            host = host.split("@", 1)[-1]
        if ":" in host:
            host = host.split(":", 1)[0]
        host = host.lstrip("www.")
        return host
    except Exception:
        return ""


def _is_ml_url(u: str) -> bool:
    """
    Aceita:
      - mercadolivre / mercadolibre (qualquer TLD)
      - lista.mercadolivre...
      - mercadolivre.com/sec/...
      - shortlinks: meli.la (e variações meli.xx)
    """
    if not u:
        return False
    x = _clean_url(u).lower()
    host = _host_of(x)
    if not host:
        return False

    if host in _ML_SHORT_HOSTS:
        return True

    # alguns países usam meli.<tld> — mantém robusto
    if re.fullmatch(r"meli\.[a-z]{2,6}", host or ""):
        return True

    for marker in _ML_HOST_MARKERS:
        if marker in host:
            return True

    return False


def _is_ml_short(u: str) -> bool:
    host = _host_of(_clean_url(u).lower())
    if not host:
        return False
    if host in _ML_SHORT_HOSTS:
        return True
    if re.fullmatch(r"meli\.[a-z]{2,6}", host or ""):
        return True
    return False


def _resolve_final_url(u: str, timeout: float = 8.0) -> str:
    """
    Resolve redirects e retorna a URL final.
    - NÃO falha o job se der erro.
    """
    x = _clean_url(u)
    if not x:
        return ""
    try:
        req = urllib.request.Request(
            x,
            method="GET",
            headers={
                "User-Agent": "Mozilla/5.0 (CN-CMS; GitHubActions)",
                "Accept": "*/*",
                "Range": "bytes=0-0",
            },
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            final = resp.geturl() or x
            return _clean_url(final)
    except Exception:
        return ""


def _normalize_ml_links(open_url: str, id_busca: str) -> Dict[str, str]:
    """
    Normaliza e blinda contra mudança do Mercado Livre:
      - aceita meli.la
      - tenta resolver shortlink -> /sec/ quando possível
      - sempre gera canonical_url estável se tiver id_busca (lista.mercadolivre...)
      - check_url inteligente:
          * se /sec/ resolvido -> check=open=/sec/
          * se resolve para ML mas sem /sec/ -> check=resolved (mais fiel)
          * se não resolve -> check=canonical (se existir) senão open
    """
    ou = _clean_url(open_url or "")
    ib = _clean_ml_id(id_busca or "")

    canonical_url = _ml_search_url(ib) if ib else ""

    short_url = ""
    resolved_url = ""
    check_url = ou

    # Se não tem open_url, mas tem ID, usa canonical
    if not ou and canonical_url:
        ou = canonical_url
        check_url = canonical_url
        return {
            "open_url": ou,
            "check_url": check_url,
            "canonical_url": canonical_url,
            "short_url": short_url,
            "resolved_url": resolved_url,
        }

    # Shortlink: tenta resolver
    if ou and _is_ml_short(ou) and _RESOLVE_SHORT:
        final = _resolve_final_url(ou, timeout=_SHORT_TIMEOUT)
        if final and final != ou and _is_ml_url(final):
            resolved_url = final
            short_url = ou

            # /sec/ é o melhor cenário
            if "/sec/" in final:
                ou = final
                check_url = final
            else:
                # mantém tracking do short no open_url, mas check_url fica mais fiel
                check_url = final

    # Se check_url vazio, tenta canonical; senão, usa open
    if not check_url:
        check_url = canonical_url or ou

    # Se open_url não é ML (caso extremo), cai pro canonical
    if ou and not _is_ml_url(ou):
        ou = canonical_url or ""
    if check_url and not _is_ml_url(check_url):
        check_url = canonical_url or ou

    # Se ainda não tem open_url, tenta canonical
    if not ou and canonical_url:
        ou = canonical_url
    if not check_url and ou:
        check_url = ou

    return {
        "open_url": ou,
        "check_url": check_url,
        "canonical_url": canonical_url,
        "short_url": short_url,
        "resolved_url": resolved_url,
    }


def _enforce_single_featured(products: List[Dict[str, Any]]) -> None:
    """
    Garante no máximo 1 featured=True.
    Se tiver vários, mantém o primeiro e desmarca o resto.
    """
    first_idx: Optional[int] = None
    for i, p in enumerate(products or []):
        if not isinstance(p, dict):
            continue
        if p.get("featured") is True:
            first_idx = i
            break

    if first_idx is None:
        return

    for i, p in enumerate(products or []):
        if not isinstance(p, dict):
            continue
        if i != first_idx:
            p["featured"] = False


def _dedupe_key(id_busca: str, open_url: str, canonical_url: str) -> str:
    """
    Chave estável pra deduplicar.
    Prioridade: id_busca > canonical_url > open_url.
    """
    ib = (id_busca or "").strip().upper()
    cu = (canonical_url or "").strip().lower()
    ou = (open_url or "").strip().lower()
    if ib:
        return f"id:{ib}"
    if cu:
        return f"c:{cu}"
    if ou:
        return f"url:{ou}"
    return ""
def _sanitize_existing_products(products: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Remove itens claramente inválidos + normaliza links do ML:
      - sku/title com HTML
      - open_url não-ML => cai pro canonical (se tiver id_busca)
      - URLs com lixo no fim
      - image URL que não é imagem => limpa
    Também:
      - corrige assets/assets
    + DEDUPE:
      - evita duplicados por sku
      - evita duplicados por id_busca/canonical/open_url
    """
    out: List[Dict[str, Any]] = []
    seen_sku = set()
    seen_key = set()

    for p in (products or []):
        if not isinstance(p, dict):
            continue

        raw_sku = str(p.get("sku") or "").strip()
        if not raw_sku:
            continue
        if _looks_like_html_blob(raw_sku):
            continue

        sku = raw_sku.strip()
        if sku in seen_sku:
            continue

        raw_title = str(p.get("title") or "")
        if _looks_like_html_blob(raw_title):
            continue
        title = _clean_title(raw_title)
        if not title:
            continue

        id_busca = _clean_ml_id(str(p.get("id_busca") or ""))

        open_url_raw = _clean_url(str(p.get("open_url") or ""))
        check_url_raw = _clean_url(str(p.get("check_url") or ""))
        canonical_raw = _clean_url(str(p.get("canonical_url") or ""))

        # normaliza ML (gera canonical se tiver id)
        norm = _normalize_ml_links(open_url_raw, id_busca)
        open_url = norm.get("open_url") or ""
        check_url = norm.get("check_url") or ""
        canonical_url = norm.get("canonical_url") or canonical_raw or ""

        # dedupe por id/canonical/open
        dk = _dedupe_key(id_busca, open_url, canonical_url)
        if dk and dk in seen_key:
            continue

        # marca chaves vistas
        if id_busca:
            seen_key.add(f"id:{id_busca.upper()}")
        if canonical_url:
            seen_key.add(f"c:{canonical_url.lower()}")
        if open_url:
            seen_key.add(f"url:{open_url.lower()}")
        if dk:
            seen_key.add(dk)

        # image
        image_raw = str(p.get("image") or "")
        image_norm = _normalize_asset_path(image_raw)
        if image_norm.startswith(("http://", "https://", "data:image/")):
            if not _is_image_url(image_norm):
                image_norm = ""

        # aplica sanitizado
        p["sku"] = sku
        p["title"] = title
        p["id_busca"] = id_busca
        p["open_url"] = open_url
        p["check_url"] = check_url or (check_url_raw if _is_ml_url(check_url_raw) else open_url)
        p["canonical_url"] = canonical_url
        p["image"] = image_norm

        p.setdefault("badges", [])
        p.setdefault("price_text", "")
        p.setdefault("last_checked", "")
        p.setdefault("last_ok", "")
        p.setdefault("active", True)
        p.setdefault("featured", False)

        out.append(p)
        seen_sku.add(sku)

    _enforce_single_featured(out)
    return out


def _build_product_from_issue(issue: Dict[str, Any]) -> Dict[str, Any]:
    body = (issue.get("body") or "").strip()
    sections = _parse_sections(body)

    labels = [l.get("name", "") for l in (issue.get("labels") or []) if isinstance(l, dict)]
    labels_lc = {x.lower() for x in labels if x}

    # ✅ Issue especial: "CMS Produto do Dia" (só aponta um SKU existente)
    if "cms-produto-do-dia" in labels_lc:
        sku_raw = _first_meaningful_line(_get_section(sections, r"^SKU\b")) or _first_meaningful_line(body)
        sku = _clean_sku(sku_raw)
        if not sku:
            raise ValueError("Produto do Dia: SKU inválido no issue cms-produto-do-dia.")
        return {
            "sku": sku,
            "title": "",
            "badges": None,
            "id_busca": "",
            "open_url": "",
            "check_url": "",
            "canonical_url": "",
            "image": "",
            "price_text": None,
            "active": True,
            "featured": True,
            "last_checked": "",
            "last_ok": "",
            "_special_set_featured_only": True,
        }

    sku_raw = _first_meaningful_line(_get_section(sections, r"^SKU\b"))
    title_raw = _first_meaningful_line(_get_section(sections, r"^T[ií]tulo\b"))
    badges_raw = _first_meaningful_line(_get_section(sections, r"Badges/Tags|Badges|Tags"))
    id_raw = _first_meaningful_line(_get_section(sections, r"ID\s+Mercado\s+Livre|ID\s+ML|ID\b"))

    link_block = _get_section(sections, r"Link\s+Mercado\s+Livre|Link\s+ML|Link\b")
    img_block = _get_section(sections, r"Imagem\b")

    link_ml = _first_url(link_block) or _first_url(_first_meaningful_line(link_block))

    # ✅ imagem agora SÓ se parecer imagem (evita pegar link do ML como "image")
    image_url = _first_image_url(img_block) or _first_image_url(_first_meaningful_line(img_block))
    if not image_url:
        image_url = _first_image_url(body)

    sku = _clean_sku(sku_raw)
    title = _clean_title(title_raw)
    id_busca = _clean_ml_id(id_raw)
    badges = _split_badges_optional(_clean_title(badges_raw))

    active_state = _checkbox_state(body, r"Ativo")
    featured_state = _checkbox_state(body, r"Definir\s+como\s+Produto\s+do\s+Dia|featured|Produto\s+do\s+Dia")

    active = True if active_state is None else bool(active_state)
    featured = bool(featured_state) if featured_state is not None else False

    if not title:
        title = (issue.get("title") or "").strip()

    # validações fortes
    if not sku:
        raise ValueError("Não consegui ler um SKU válido. (Evite colar imagem/HTML no campo SKU.)")

    if not link_ml and not id_busca:
        raise ValueError("Produto sem link: preencha 'Link Mercado Livre' ou 'ID Mercado Livre'.")

    if link_ml and not _is_ml_url(link_ml):
        raise ValueError("O 'Link Mercado Livre' precisa ser do Mercado Livre (ex.: https://mercadolivre.com/sec/... ou https://meli.la/... ).")

    open_url = _clean_url(link_ml) if link_ml else ""
    norm = _normalize_ml_links(open_url, id_busca)

    open_url = norm.get("open_url") or open_url or _ml_search_url(id_busca)
    check_url = norm.get("check_url") or open_url
    canonical_url = norm.get("canonical_url") or (_ml_search_url(id_busca) if id_busca else "")
    short_url = norm.get("short_url") or ""
    resolved_url = norm.get("resolved_url") or ""

    if not open_url:
        raise ValueError("Não consegui montar o open_url. Confira Link/ID do Mercado Livre.")

    image = _normalize_asset_path(image_url)

    product: Dict[str, Any] = {
        "sku": sku,
        "title": title,
        "badges": badges,  # None = não sobrescreve
        "id_busca": id_busca,
        "open_url": open_url,
        "check_url": check_url,
        "canonical_url": canonical_url,
        "image": image,
        "price_text": None,  # não sobrescreve com vazio
        "active": bool(active),
        "featured": bool(featured),
        "last_checked": "",
        "last_ok": "",
        "_special_set_featured_only": False,
    }

    # extras úteis pra debug/robustez (não quebram front)
    if short_url:
        product["short_url"] = short_url
    if resolved_url:
        product["resolved_url"] = resolved_url

    return product


def _urlish_fields(p: Dict[str, Any]) -> List[str]:
    return [
        str(p.get("open_url") or ""),
        str(p.get("check_url") or ""),
        str(p.get("canonical_url") or ""),
        str(p.get("short_url") or ""),
        str(p.get("resolved_url") or ""),
    ]


def _find_existing_by_id_or_any_url(products: List[Dict[str, Any]], id_busca: str, incoming_urls: List[str]) -> Optional[int]:
    ib = _clean_ml_id(id_busca or "")
    incoming_norm = set(_clean_url(u).lower() for u in incoming_urls if u)

    for i, p in enumerate(products or []):
        if not isinstance(p, dict):
            continue

        pib = _clean_ml_id(str(p.get("id_busca") or ""))
        if ib and pib and ib == pib:
            return i

        existing_urls = set(_clean_url(u).lower() for u in _urlish_fields(p) if u)
        if incoming_norm and existing_urls and (incoming_norm & existing_urls):
            return i

    return None


def _upsert_product(data: Dict[str, Any], incoming: Dict[str, Any]) -> Dict[str, Any]:
    products: List[Dict[str, Any]] = data.get("products") or []
    if not isinstance(products, list):
        products = []

    # ✅ limpa tudo que já existe + dedupe robusto
    products = _sanitize_existing_products(products)

    sku = (incoming.get("sku") or "").strip()
    if not sku:
        data["products"] = products
        return data

    special_set_featured_only = bool(incoming.pop("_special_set_featured_only", False))

    # ✅ Caso especial: apenas definir featured por SKU existente
    if special_set_featured_only:
        target_idx = next((i for i, p in enumerate(products) if isinstance(p, dict) and (p.get("sku") == sku)), None)
        if target_idx is None:
            raise ValueError(f"Produto do Dia: SKU '{sku}' não existe em produtos.json ainda.")
        for p in products:
            if not isinstance(p, dict):
                continue
            p["featured"] = bool(p.get("sku") == sku)
        _enforce_single_featured(products)
        data["products"] = products
        return data

    # normaliza incoming (links + canonical)
    id_busca = _clean_ml_id(str(incoming.get("id_busca") or ""))
    open_url_in = _clean_url(str(incoming.get("open_url") or ""))
    norm = _normalize_ml_links(open_url_in, id_busca)

    incoming["open_url"] = norm.get("open_url") or open_url_in
    incoming["check_url"] = norm.get("check_url") or incoming["open_url"]
    incoming["canonical_url"] = norm.get("canonical_url") or (_ml_search_url(id_busca) if id_busca else "")
    if norm.get("short_url"):
        incoming["short_url"] = norm.get("short_url")
    if norm.get("resolved_url"):
        incoming["resolved_url"] = norm.get("resolved_url")

    if incoming.get("image"):
        incoming["image"] = _normalize_asset_path(str(incoming.get("image") or ""))

    # 1) tenta pelo SKU
    idx = next((i for i, p in enumerate(products) if isinstance(p, dict) and (p.get("sku") == sku)), None)

    # 2) se não achou, tenta pelo id_busca ou qualquer URL (open/check/canonical/short/resolved)
    if idx is None:
        idx2 = _find_existing_by_id_or_any_url(
            products,
            id_busca,
            [incoming.get("open_url"), incoming.get("check_url"), incoming.get("canonical_url"), incoming.get("short_url"), incoming.get("resolved_url")],
        )
        if idx2 is not None:
            idx = idx2

    if idx is None:
        existing: Dict[str, Any] = {}
        products.append(existing)
        idx = len(products) - 1
    else:
        existing = products[idx] if isinstance(products[idx], dict) else {}
        products[idx] = existing

    # preserva monitoramento se já existirem
    preserve_keys = {"last_checked", "last_ok"}
    for k in preserve_keys:
        if k in existing and (not incoming.get(k)):
            incoming[k] = existing.get(k, "")

    # aplica campos
    for k, v in incoming.items():
        if k in {"sku", "title", "open_url", "check_url", "canonical_url", "image", "active", "featured", "id_busca", "short_url", "resolved_url"}:
            if v is None and k not in {"id_busca"}:
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

        existing[k] = v

    existing.setdefault("badges", [])
    existing.setdefault("price_text", "")
    existing.setdefault("last_checked", "")
    existing.setdefault("last_ok", "")
    existing.setdefault("active", True)
    existing.setdefault("featured", False)
    existing.setdefault("canonical_url", existing.get("canonical_url") or (_ml_search_url(existing.get("id_busca")) if existing.get("id_busca") else ""))

    # se marcou featured, desmarca os outros
    if existing.get("featured") is True:
        for p in products:
            if not isinstance(p, dict):
                continue
            if p.get("sku") != existing.get("sku"):
                p["featured"] = False

    # ✅ limpeza final + featured único
    products = _sanitize_existing_products(products)
    _enforce_single_featured(products)

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
    print(f"Check URL: {incoming.get('check_url')}")
    print(f"Canonical URL: {incoming.get('canonical_url')}")
    print(f"ID Busca: {incoming.get('id_busca')}")
    print(f"Image: {incoming.get('image')}")
    if incoming.get("short_url"):
        print(f"Short URL: {incoming.get('short_url')}")
    if incoming.get("resolved_url"):
        print(f"Resolved URL: {incoming.get('resolved_url')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
