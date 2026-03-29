# ==========================================================
# Arquivo: tools/cms_produtos.py
# Módulo : CMS Produtos — Issue -> produtos.json (gh-pages)
# Versão : v10.3 (edição preserva featured/quick_home + CMS não auto-desativa por destino social/lists)
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

# ✅ URL regex agora NÃO captura "\\" no fim (evita https://...\" virar URL inválida)
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

# validação estrutural agressiva desligada por padrão no CMS
# (o Guardian continua responsável por revisar/promover/desativar links)
_STRICT_ML_TARGET_VALIDATION = os.getenv("CN_CMS_STRICT_ML_TARGET_VALIDATION", "0").strip().lower() in {"1", "true", "yes", "on"}

_VALID_REVIEW_ACTIONS = {
    "manter",
    "precisa_relink",
    "reativar",
    "desativar_manual",
}

_VALID_REVIEW_STATUSES = {
    "ativo",
    "em_revisao",
    "precisa_relink",
    "desativado_manual",
}


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
    if not u:
        return ""

    x = str(u).strip()

    while x and x[0] in {"'", '"', " "}:
        x = x[1:]

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

    if "github.com/user-attachments/assets/" in x:
        return True

    if re.search(r"\.(png|jpg|jpeg|webp|gif)(\?.*)?$", x):
        return True

    return False


def _first_image_url(text: str) -> str:
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


def _split_csv_optional(raw: str) -> Optional[List[str]]:
    if not raw or not raw.strip():
        return None
    raw2 = raw.replace(";", ",").replace("|", ",")
    parts = [p.strip() for p in raw2.split(",")]
    seen = set()
    out: List[str] = []
    for p in parts:
        if not p:
            continue
        key = p.casefold()
        if key in seen:
            continue
        seen.add(key)
        out.append(p)
    return out


def _clean_category_name(s: str) -> str:
    x = _clean_optional_text(s)
    x = re.sub(r"\s+", " ", x).strip(" ,-")
    return x


def _clean_search_aliases(raw: str) -> Optional[List[str]]:
    items = _split_csv_optional(raw)
    if not items:
        return None

    out: List[str] = []
    seen = set()
    for item in items:
        x = _clean_optional_text(item)
        if not x:
            continue
        key = x.casefold()
        if key in seen:
            continue
        seen.add(key)
        out.append(x)
    return out


def _clean_secondary_categories(raw: str) -> Optional[List[str]]:
    items = _split_csv_optional(raw)
    if not items:
        return None

    out: List[str] = []
    seen = set()
    for item in items:
        x = _clean_category_name(item)
        if not x:
            continue
        key = x.casefold()
        if key in seen:
            continue
        seen.add(key)
        out.append(x)
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

    if x.startswith("http://") or x.startswith("https://") or x.startswith("data:image/"):
        return x.strip()

    x2 = x.strip().replace("\\", "/").lstrip("./").lstrip("/")
    x2 = re.sub(r"(?i)^assets/assets/", "assets/", x2)
    x2 = re.sub(r"(?i)^assets/products/", "assets/produtos/", x2)

    return x2


def _ml_search_url(query: str) -> str:
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
    raw = (s or "").strip()
    if _looks_like_html_blob(raw):
        return ""
    x = _strip_html(raw).upper().strip()
    x = re.sub(r"[^A-Z0-9-]", "", x)
    return x


def _clean_optional_text(s: str) -> str:
    if not s:
        return ""
    x = _strip_html(s)
    x = re.sub(r"\s+", " ", x).strip()
    return "" if _is_placeholder(x) else x


_EDIT_FORM_DEFAULTS = {
    "title": {
        "novo titulo do produto",
        "novo título do produto",
    },
    "categoria_principal": {
        "tecnologia",
    },
    "categorias_secundarias": {
        "notebook, pc, armazenamento",
    },
    "aliases_busca": {
        "ssd kingston, nvme 1tb, kingston nv3",
    },
    "badges": {
        "achados do dia, tecnologia, premium",
    },
    "quick_home_order": {
        "1",
    },
}


def _norm_form_text_key(s: str) -> str:
    x = _clean_optional_text(s)
    x = x.casefold()
    x = re.sub(r"\s+", " ", x).strip()
    return x


def _is_edit_form_default(field: str, value: str) -> bool:
    if not value:
        return False
    key = _norm_form_text_key(value)
    defaults = _EDIT_FORM_DEFAULTS.get(field) or set()
    return key in defaults


def _clean_edit_optional_text(value: str, field: str = "") -> Optional[str]:
    x = _clean_optional_text(value)
    if not x:
        return None
    if field and _is_edit_form_default(field, x):
        return None
    return x


def _clean_edit_optional_url(value: str) -> Optional[str]:
    x = _clean_url(value)
    if not x:
        return None

    xl = x.lower()
    if "..." in xl:
        return None
    if "/sec/..." in xl:
        return None
    if "meli.la/..." in xl:
        return None
    if xl in {"https://...", "http://..."}:
        return None

    return x

def _parse_optional_bool_text(s: str) -> Optional[bool]:
    x = _clean_optional_text(s).lower()
    if not x:
        return None

    yes_values = {
        "sim",
        "true",
        "1",
        "yes",
        "y",
        "marcado",
        "ativado",
        "ativa",
        "ativo",
    }
    no_values = {
        "nao",
        "não",
        "false",
        "0",
        "no",
        "n",
        "desmarcado",
        "desativado",
        "desativada",
        "inativo",
        "inativa",
    }

    if x in yes_values:
        return True
    if x in no_values:
        return False
    return None


def _clean_order_int(v: Any, default: int = 0) -> int:
    if v is None:
        return int(default)

    x = _strip_html(str(v)).strip()
    if not x:
        return int(default)

    m = re.search(r"-?\d+", x)
    if not m:
        return int(default)

    try:
        n = int(m.group(0))
    except Exception:
        return int(default)

    return n if n > 0 else int(default)


def _clean_issue_number(v: Any) -> int:
    if v is None:
        return 0
    x = _strip_html(str(v)).strip()
    m = re.search(r"(\d+)", x)
    return int(m.group(1)) if m else 0


def _issue_url_from_repo(repo_html_url: str, issue_number: int) -> str:
    if not issue_number:
        return ""
    base = (repo_html_url or "").strip().rstrip("/")
    if not base:
        return ""
    return f"{base}/issues/{int(issue_number)}"


def _normalize_review_action(s: str) -> str:
    x = _clean_optional_text(s).lower()
    x = x.replace("—", "-").replace("–", "-")
    x = re.sub(r"\s+", " ", x)

    if "precisa" in x and "relink" in x:
        return "precisa_relink"
    if "reativ" in x:
        return "reativar"
    if "desativ" in x:
        return "desativar_manual"
    return "manter"


def _normalize_review_status(s: str) -> str:
    x = _clean_optional_text(s).lower()
    x = x.replace("—", "-").replace("–", "-")
    if "precisa" in x and "relink" in x:
        return "precisa_relink"
    if "revis" in x:
        return "em_revisao"
    if "desativ" in x:
        return "desativado_manual"
    return "ativo"




def _enforce_active_featured_quick_home_consistency(product: Dict[str, Any]) -> None:
    if not isinstance(product, dict):
        return

    active_value = product.get("active", True)
    active_bool = bool(active_value)

    if not active_bool:
        product["featured"] = False
        if "quick_home" in product:
            product["quick_home"] = False
        if "quick_home_order" in product:
            product["quick_home_order"] = 0

        review_action = _normalize_review_action(str(product.get("review_action") or "manter"))
        review_status = _normalize_review_status(str(product.get("review_status") or "ativo"))

        if review_action == "manter":
            product["review_action"] = "desativar_manual" if review_status == "desativado_manual" else "precisa_relink"
        else:
            product["review_action"] = review_action

        if review_status not in {"precisa_relink", "desativado_manual", "em_revisao"}:
            product["review_status"] = "precisa_relink"
        else:
            product["review_status"] = review_status
    else:
        product["active"] = True

def _host_of(u: str) -> str:
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
    if not u:
        return False
    x = _clean_url(u).lower()
    host = _host_of(x)
    if not host:
        return False

    if host in _ML_SHORT_HOSTS:
        return True

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


def _bad_ml_target_reason(u: str) -> str:
    x = _clean_url(u)
    if not x or not _is_ml_url(x):
        return ""

    try:
        pu = urlparse(x)
    except Exception:
        return ""

    host = _host_of(x)
    path = (pu.path or "").strip().lower()
    query = (pu.query or "").strip().lower()
    full = f"{host}{path}?{query}".strip("?")

    if host.startswith("lista."):
        return ""

    if re.search(r"(^|/)lists(?:/|$)", path):
        return "destino /lists"

    if "account-verification" in full or "account_verification" in full:
        return "account-verification"

    if re.search(r"(^|/)social(?:/|$)", path):
        return "destino /social/"

    return ""


def _ensure_manual_ml_target_safe(label: str, u: str) -> None:
    # Produção: o CMS não deve derrubar cadastro por heurística estrutural.
    # Quem decide revisão/desativação é o Link Guardian.
    if not _STRICT_ML_TARGET_VALIDATION:
        return

    reason = _bad_ml_target_reason(u)
    if reason:
        raise ValueError(
            f"O '{label}' aponta para um destino estruturalmente ruim do Mercado Livre ({reason}). "
            "Use um link de produto real."
        )


def _merge_notes(existing: str, extra: str) -> str:
    base = _clean_optional_text(existing)
    add = _clean_optional_text(extra)
    if not base:
        return add
    if not add:
        return base
    if add.casefold() in base.casefold():
        return base
    return f"{base} | {add}"


def _resolve_final_url(u: str, timeout: float = 8.0) -> str:
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


def _normalize_ml_links(open_url: str, id_busca: str, preferred_check_url: str = "", preferred_canonical_url: str = "") -> Dict[str, str]:
    ou = _clean_url(open_url or "")
    ib = _clean_ml_id(id_busca or "")
    preferred_check = _clean_url(preferred_check_url or "")
    preferred_canonical = _clean_url(preferred_canonical_url or "")

    canonical_url = preferred_canonical or (_ml_search_url(ib) if ib else "")

    short_url = ""
    resolved_url = ""
    check_url = preferred_check or ou

    if not ou and canonical_url:
        ou = canonical_url
        check_url = preferred_check or canonical_url
        return {
            "open_url": ou,
            "check_url": check_url,
            "canonical_url": canonical_url,
            "short_url": short_url,
            "resolved_url": resolved_url,
        }

    if ou and _is_ml_short(ou) and _RESOLVE_SHORT:
        final = _resolve_final_url(ou, timeout=_SHORT_TIMEOUT)
        if final and final != ou and _is_ml_url(final):
            resolved_url = final
            short_url = ou

            if "/sec/" in final:
                ou = final
                if not preferred_check:
                    check_url = final
            else:
                if not preferred_check:
                    check_url = final

    if not check_url:
        check_url = preferred_check or canonical_url or ou

    if ou and not _is_ml_url(ou):
        ou = canonical_url or ""
    if check_url and not _is_ml_url(check_url):
        check_url = canonical_url or ou

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

        norm = _normalize_ml_links(
            open_url_raw,
            id_busca,
            preferred_check_url=check_url_raw,
            preferred_canonical_url=canonical_raw,
        )
        open_url = norm.get("open_url") or ""
        check_url = norm.get("check_url") or ""
        canonical_url = norm.get("canonical_url") or canonical_raw or ""

        dk = _dedupe_key(id_busca, open_url, canonical_url)
        if dk and dk in seen_key:
            continue

        if id_busca:
            seen_key.add(f"id:{id_busca.upper()}")
        if canonical_url:
            seen_key.add(f"c:{canonical_url.lower()}")
        if open_url:
            seen_key.add(f"url:{open_url.lower()}")
        if dk:
            seen_key.add(dk)

        image_raw = str(p.get("image") or "")
        image_norm = _normalize_asset_path(image_raw)
        if image_norm.startswith(("http://", "https://", "data:image/")):
            if not _is_image_url(image_norm):
                image_norm = ""

        p["sku"] = sku
        p["title"] = title
        p["id_busca"] = id_busca
        p["open_url"] = open_url
        p["check_url"] = check_url or (check_url_raw if _is_ml_url(check_url_raw) else open_url)
        p["canonical_url"] = canonical_url
        p["image"] = image_norm

        review_action = _normalize_review_action(str(p.get("review_action") or "manter"))
        review_status = _normalize_review_status(str(p.get("review_status") or "ativo"))

        p["review_action"] = review_action
        p["review_status"] = review_status
        p["review_reason"] = _clean_optional_text(str(p.get("review_reason") or ""))
        p["replacement_vendor"] = _clean_optional_text(str(p.get("replacement_vendor") or ""))
        p["relink_open_url"] = _clean_url(str(p.get("relink_open_url") or ""))
        p["notes"] = _clean_optional_text(str(p.get("notes") or ""))
        p["alt_url"] = _clean_url(str(p.get("alt_url") or ""))
        if "quick_home" in p:
            parsed_quick_home = p.get("quick_home")
            if isinstance(parsed_quick_home, str):
                parsed_quick_home = _parse_optional_bool_text(parsed_quick_home)
            elif isinstance(parsed_quick_home, bool):
                parsed_quick_home = parsed_quick_home
            else:
                parsed_quick_home = bool(parsed_quick_home) if parsed_quick_home in {0, 1} else None

            if parsed_quick_home is None:
                p.pop("quick_home", None)
            else:
                p["quick_home"] = bool(parsed_quick_home)

        if "quick_home_order" in p:
            p["quick_home_order"] = _clean_order_int(p.get("quick_home_order"), default=0)
            if p["quick_home_order"] <= 0:
                p.pop("quick_home_order", None)

        p["issue_number"] = _clean_issue_number(p.get("issue_number") or p.get("source_issue_number") or p.get("target_issue_number"))
        p["issue_url"] = _clean_url(str(p.get("issue_url") or ""))
        p["issue_title"] = _clean_optional_text(str(p.get("issue_title") or ""))

        categoria_principal = _clean_category_name(str(p.get("categoria_principal") or ""))
        if categoria_principal:
            p["categoria_principal"] = categoria_principal
        else:
            p.pop("categoria_principal", None)

        categorias_secundarias = p.get("categorias_secundarias")
        if isinstance(categorias_secundarias, list):
            sec_raw = ",".join(str(x) for x in categorias_secundarias)
        else:
            sec_raw = str(categorias_secundarias or "")
        sec_clean = _clean_secondary_categories(sec_raw)
        if sec_clean:
            if categoria_principal:
                sec_clean = [x for x in sec_clean if x.casefold() != categoria_principal.casefold()]
            if sec_clean:
                p["categorias_secundarias"] = sec_clean
            else:
                p.pop("categorias_secundarias", None)
        else:
            p.pop("categorias_secundarias", None)

        aliases_busca = p.get("aliases_busca")
        if isinstance(aliases_busca, list):
            alias_raw = ",".join(str(x) for x in aliases_busca)
        else:
            alias_raw = str(aliases_busca or "")
        alias_clean = _clean_search_aliases(alias_raw)
        if alias_clean:
            p["aliases_busca"] = alias_clean
        else:
            p.pop("aliases_busca", None)

        p.setdefault("badges", [])
        p.setdefault("price_text", "")
        p.setdefault("last_checked", "")
        p.setdefault("last_ok", "")
        p.setdefault("active", True)
        p.setdefault("featured", False)

        _enforce_active_featured_quick_home_consistency(p)

        out.append(p)
        seen_sku.add(sku)

    _enforce_single_featured(out)
    return out


def _build_product_from_issue(issue: Dict[str, Any]) -> Dict[str, Any]:
    body = (issue.get("body") or "").strip()
    sections = _parse_sections(body)

    labels = [l.get("name", "") for l in (issue.get("labels") or []) if isinstance(l, dict)]
    labels_lc = {x.lower() for x in labels if x}

    if "cms-produto-do-dia" in labels_lc:
        sku_raw = _first_meaningful_line(_get_section(sections, r"^SKU\b")) or _first_meaningful_line(body)
        sku = _clean_sku(sku_raw)
        if not sku:
            raise ValueError("Produto do Dia: SKU inválido no issue cms-produto-do-dia.")

        reactivate_target = _checkbox_state(body, r"Reativar\s+o\s+produto|Reativar\s+se\s+inativo")
        featured_note_block = _get_section(sections, r"Observa[cç][aã]o|Motivo|Notas?")
        featured_note = _clean_optional_text(featured_note_block.replace("- [x]", "").replace("- [ ]", "").replace("- ", "\n"))

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
            "featured_note": featured_note,
            "issue_number": int(issue.get("number") or 0),
            "issue_url": _clean_url(str(issue.get("html_url") or "")),
            "issue_title": _clean_optional_text(str(issue.get("title") or "")),
            "_source_issue_number": int(issue.get("number") or 0),
            "_target_issue_number": 0,
            "_reactivate_featured_target": bool(reactivate_target),
            "_special_set_featured_only": True,
        }

    target_issue_raw = _first_meaningful_line(_get_section(sections, r"N[uú]mero\s+da\s+issue\s+original|Issue\s+original|Issue\s+do\s+produto"))
    target_issue_number = _clean_issue_number(target_issue_raw)
    is_edit_mode = bool(target_issue_number)

    sku_raw = _first_meaningful_line(_get_section(sections, r"^SKU\b"))
    title_raw = _first_meaningful_line(_get_section(sections, r"^T[ií]tulo\b"))
    badges_raw = _first_meaningful_line(_get_section(sections, r"Badges/Tags|Badges|Tags"))
    id_raw = _first_meaningful_line(_get_section(sections, r"ID\s+Mercado\s+Livre|ID\s+ML|ID\b"))
    categoria_principal_raw = _first_meaningful_line(
        _get_section(sections, r"Categoria\s+Principal|Categoria\s+Can[oô]nica\s+Principal")
    )
    categorias_secundarias_raw = _first_meaningful_line(
        _get_section(sections, r"Categorias\s+Secund[aá]rias|Categorias\s+Extras|Categorias\s+Complementares")
    )
    aliases_busca_raw = _first_meaningful_line(
        _get_section(sections, r"Aliases\s+de\s+Busca|Termos\s+de\s+Busca|Palavras\s+de\s+Busca")
    )

    link_block = _get_section(sections, r"Link\s+Mercado\s+Livre|Link\s+ML|Link\b")
    new_link_block = _get_section(sections, r"Novo\s+Link\s+Mercado\s+Livre|Relink|Novo\s+Link\b")
    check_block = _get_section(sections, r"check_url|Check\s+URL")
    canonical_block = _get_section(sections, r"canonical_url|Canonical\s+URL")
    alt_block = _get_section(sections, r"Link\s+Alternativo|Alt\s+URL|Fallback")
    img_block = _get_section(sections, r"Imagem\b")
    review_action_block = _get_section(sections, r"A[cç][aã]o\s+manual|A[cç][aã]o\b")
    review_status_block = _get_section(sections, r"Status\s+de\s+revis[aã]o|Status\s+de\s+manut")
    review_reason_block = _get_section(sections, r"Motivo|Problema|Raz[aã]o")
    replacement_vendor_block = _get_section(sections, r"Novo\s+vendedor|Vendedor")
    notes_block = _get_section(sections, r"Observa[cç][oõ]es|Notas|Anota[cç][oõ]es")
    quick_home_block = _get_section(
        sections,
        r"Entrar\s+na\s+Vitrine\s+R[aá]pida|Vitrine\s+R[aá]pida|Quick\s*Home",
    )
    quick_home_order_block = _get_section(
        sections,
        r"Posi[cç][aã]o\s+na\s+Vitrine\s+R[aá]pida|Ordem\s+da\s+Vitrine\s+R[aá]pida|Quick\s*Home\s*Order",
    )

    link_ml = _clean_edit_optional_url(
        _first_url(new_link_block) or _first_url(link_block) or _first_url(_first_meaningful_line(link_block))
    ) or ""
    check_url_manual = _clean_edit_optional_url(_first_url(check_block) or _first_url(_first_meaningful_line(check_block))) or ""
    canonical_url_manual = _clean_edit_optional_url(
        _first_url(canonical_block) or _first_url(_first_meaningful_line(canonical_block))
    ) or ""
    alt_url = _clean_edit_optional_url(_first_url(alt_block) or _first_url(_first_meaningful_line(alt_block))) or ""

    image_url = _first_image_url(img_block) or _first_image_url(_first_meaningful_line(img_block))
    if not image_url:
        image_url = _first_image_url(body)

    sku = _clean_sku(sku_raw)

    if is_edit_mode:
        title_clean = _clean_edit_optional_text(title_raw, field="title")
        title = _clean_title(title_clean) if title_clean else None

        id_clean = _clean_edit_optional_text(id_raw)
        id_busca = _clean_ml_id(id_clean) if id_clean else ""

        badges_clean = _clean_edit_optional_text(badges_raw, field="badges")
        badges = _split_badges_optional(_clean_title(badges_clean)) if badges_clean else None

        categoria_principal_clean = _clean_edit_optional_text(categoria_principal_raw, field="categoria_principal")
        categoria_principal = _clean_category_name(categoria_principal_clean) if categoria_principal_clean else None

        categorias_secundarias_clean = _clean_edit_optional_text(
            categorias_secundarias_raw,
            field="categorias_secundarias",
        )
        categorias_secundarias = (
            _clean_secondary_categories(categorias_secundarias_clean)
            if categorias_secundarias_clean
            else None
        )

        aliases_busca_clean = _clean_edit_optional_text(aliases_busca_raw, field="aliases_busca")
        aliases_busca = _clean_search_aliases(aliases_busca_clean) if aliases_busca_clean else None

        review_action_line = _clean_edit_optional_text(_first_meaningful_line(review_action_block))
        review_status_line = _clean_edit_optional_text(_first_meaningful_line(review_status_block))
        review_reason = _clean_edit_optional_text(_first_meaningful_line(review_reason_block))
        replacement_vendor = _clean_edit_optional_text(_first_meaningful_line(replacement_vendor_block))
        notes = _clean_edit_optional_text(notes_block.replace("- [x]", "").replace("- [ ]", "").replace("- ", "\n"))

        review_action = _normalize_review_action(review_action_line) if review_action_line else None
        review_status = _normalize_review_status(review_status_line) if review_status_line else None

        # MODO EDIÇÃO (SEGURANÇA DE PRODUÇÃO):
        # ------------------------------------------------------------
        # Não alterar featured / quick_home / quick_home_order / active
        # apenas por causa dos campos opcionais do formulário de edição.
        #
        # Na prática, Editar Produto Existente deve servir para trocar
        # título, link, ID, imagem, categorias, aliases, badges etc.,
        # sem bagunçar Produto do Dia nem Vitrine Rápida.
        #
        # Mudanças estruturais continuam sendo feitas por fluxos próprios
        # (ex.: template dedicado de Produto do Dia / ajustes explícitos).
        # ------------------------------------------------------------
        active = None
        featured = None
        quick_home = None
        quick_home_order = None

    else:
        title = _clean_title(title_raw)
        id_busca = _clean_ml_id(id_raw)
        badges = _split_badges_optional(_clean_title(badges_raw))
        categoria_principal = _clean_category_name(categoria_principal_raw)
        categorias_secundarias = _clean_secondary_categories(categorias_secundarias_raw)
        aliases_busca = _clean_search_aliases(aliases_busca_raw)

        review_action = _normalize_review_action(_first_meaningful_line(review_action_block))
        review_status = _normalize_review_status(_first_meaningful_line(review_status_block))
        review_reason = _clean_optional_text(_first_meaningful_line(review_reason_block))
        replacement_vendor = _clean_optional_text(_first_meaningful_line(replacement_vendor_block))
        notes = _clean_optional_text(notes_block.replace("- [x]", "").replace("- [ ]", "").replace("- ", "\n"))

        active_state = _checkbox_state(body, r"Ativo")
        featured_state = _checkbox_state(body, r"Definir\s+como\s+Produto\s+do\s+Dia|featured|Produto\s+do\s+Dia")
        quick_home_state = _checkbox_state(
            body,
            r"Entrar\s+na\s+Vitrine\s+R[aá]pida|Vitrine\s+R[aá]pida|Quick\s*Home",
        )

        if quick_home_state is None:
            quick_home_state = _parse_optional_bool_text(_first_meaningful_line(quick_home_block))

        quick_home_order = _clean_order_int(_first_meaningful_line(quick_home_order_block), default=0)

        if quick_home_state is False and quick_home_order <= 0:
            quick_home_order = 0

        active = True if active_state is None else bool(active_state)
        featured = bool(featured_state) if featured_state is not None else False
        quick_home = bool(quick_home_state) if quick_home_state is not None else None

    if not sku:
        raise ValueError("Não consegui ler um SKU válido. (Evite colar imagem/HTML no campo SKU.)")

    if is_edit_mode and not title:
        title = None
    elif not is_edit_mode and not title:
        issue_title_fallback = _clean_title(str(issue.get("title") or ""))
        if re.match(r"(?i)^\[?cms\]?\s*[:\-]", issue_title_fallback) or re.search(r"(?i)editar\s+produto|novo\s*/\s*atualizar\s+produto|produto\s*:", issue_title_fallback):
            issue_title_fallback = ""
        title = issue_title_fallback

    if not is_edit_mode and not link_ml and not id_busca:
        raise ValueError("Produto sem link: preencha 'Link Mercado Livre' ou 'ID Mercado Livre'.")

    if link_ml and not _is_ml_url(link_ml):
        raise ValueError("O 'Link Mercado Livre' precisa ser do Mercado Livre (ex.: https://mercadolivre.com/sec/... ou https://meli.la/... ).")

    if check_url_manual and not _is_ml_url(check_url_manual):
        raise ValueError("O 'check_url manual' precisa ser do Mercado Livre.")
    if canonical_url_manual and not _is_ml_url(canonical_url_manual):
        raise ValueError("O 'canonical_url manual' precisa ser do Mercado Livre.")
    if alt_url and not (alt_url.startswith("http://") or alt_url.startswith("https://")):
        raise ValueError("O 'Link alternativo / fallback' precisa começar com http:// ou https://.")

    if link_ml:
        _ensure_manual_ml_target_safe("Link Mercado Livre", link_ml)
    if check_url_manual:
        _ensure_manual_ml_target_safe("check_url manual", check_url_manual)
    if canonical_url_manual:
        _ensure_manual_ml_target_safe("canonical_url manual", canonical_url_manual)

    open_url: Optional[str]
    check_url: Optional[str]
    canonical_url: Optional[str]
    short_url = ""
    resolved_url = ""

    if link_ml or check_url_manual or canonical_url_manual:
        open_url = _clean_url(link_ml) if link_ml else ""
        norm = _normalize_ml_links(
            open_url,
            id_busca,
            preferred_check_url=check_url_manual,
            preferred_canonical_url=canonical_url_manual,
        )

        open_url = norm.get("open_url") or open_url or (_ml_search_url(id_busca) if id_busca and not is_edit_mode else "")
        check_url = norm.get("check_url") or open_url
        canonical_url = norm.get("canonical_url") or (_ml_search_url(id_busca) if id_busca else "")
        short_url = norm.get("short_url") or ""
        resolved_url = norm.get("resolved_url") or ""

        if not is_edit_mode and not open_url:
            raise ValueError("Não consegui montar o open_url. Confira Link/ID do Mercado Livre.")
    else:
        if is_edit_mode:
            open_url = None
            check_url = None
            canonical_url = None
        else:
            open_url = _ml_search_url(id_busca) if id_busca else ""
            check_url = open_url
            canonical_url = open_url
            if not open_url:
                raise ValueError("Não consegui montar o open_url. Confira Link/ID do Mercado Livre.")

    image = _normalize_asset_path(image_url) if image_url else None

    # Importante:
    # O CMS não pode desativar/cancelar featured/quick_home automaticamente
    # só porque o shortlink resolveu para /social/, /lists ou wrapper intermediário.
    # A verificação operacional fica no Link Guardian.

    if is_edit_mode and review_action:
        if review_action == "precisa_relink":
            active = False
            review_status = "precisa_relink"
        elif review_action == "reativar":
            active = True
            if review_status in {"precisa_relink", "desativado_manual"}:
                review_status = "ativo"
        elif review_action == "desativar_manual":
            active = False
            review_status = "desativado_manual"
        else:
            if review_status is not None and review_status not in _VALID_REVIEW_STATUSES:
                review_status = "ativo" if active else "em_revisao"
    elif not is_edit_mode:
        if review_action == "precisa_relink":
            active = False
            review_status = "precisa_relink"
        elif review_action == "reativar":
            active = True
            if review_status in {"precisa_relink", "desativado_manual"}:
                review_status = "ativo"
        elif review_action == "desativar_manual":
            active = False
            review_status = "desativado_manual"
        else:
            if review_status not in _VALID_REVIEW_STATUSES:
                review_status = "ativo" if active else "em_revisao"

    if active is False:
        featured = False
        if quick_home is not None:
            quick_home = False
        if quick_home_order is not None:
            quick_home_order = 0

    source_issue_number = int(issue.get("number") or 0)
    source_issue_url = _clean_url(str(issue.get("html_url") or ""))
    source_issue_title = _clean_optional_text(str(issue.get("title") or ""))

    product: Dict[str, Any] = {
        "sku": sku,
        "title": title,
        "badges": badges,
        "id_busca": (id_busca or None) if is_edit_mode else id_busca,
        "open_url": open_url,
        "check_url": check_url,
        "canonical_url": canonical_url,
        "image": image,
        "price_text": None,
        "active": active,
        "featured": featured,
        "last_checked": "",
        "last_ok": "",
        "review_action": review_action,
        "review_status": review_status,
        "review_reason": review_reason,
        "replacement_vendor": replacement_vendor,
        "relink_open_url": _clean_url(open_url if (open_url and _first_url(new_link_block)) else "") if open_url else None,
        "notes": notes,
        "alt_url": (_clean_url(alt_url) if alt_url else None),
        "issue_number": int(target_issue_number or source_issue_number or 0),
        "issue_url": source_issue_url,
        "issue_title": source_issue_title,
        "categoria_principal": categoria_principal,
        "categorias_secundarias": categorias_secundarias,
        "aliases_busca": aliases_busca,
        "quick_home": quick_home,
        "quick_home_order": (int(quick_home_order) if quick_home_order is not None else None),
        "_source_issue_number": source_issue_number,
        "_target_issue_number": int(target_issue_number or 0),
        "_special_set_featured_only": False,
        "_is_edit_mode": is_edit_mode,
    }

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
        str(p.get("alt_url") or ""),
        str(p.get("relink_open_url") or ""),
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

    products = _sanitize_existing_products(products)

    sku = (incoming.get("sku") or "").strip()
    if not sku:
        data["products"] = products
        return data

    special_set_featured_only = bool(incoming.pop("_special_set_featured_only", False))
    reactivate_featured_target = bool(incoming.pop("_reactivate_featured_target", False))
    is_edit_mode = bool(incoming.pop("_is_edit_mode", False))
    featured_note = _clean_optional_text(str(incoming.pop("featured_note", "") or ""))

    if special_set_featured_only:
        target_idx = next((i for i, p in enumerate(products) if isinstance(p, dict) and (p.get("sku") == sku)), None)
        if target_idx is None:
            raise ValueError(f"Produto do Dia: SKU '{sku}' não existe em produtos.json ainda.")
        for p in products:
            if not isinstance(p, dict):
                continue
            is_target = bool(p.get("sku") == sku)
            p["featured"] = is_target
            if is_target and reactivate_featured_target:
                p["active"] = True
            if is_target and featured_note:
                p["featured_note"] = featured_note
        _enforce_single_featured(products)
        data["products"] = products
        return data

    id_busca = _clean_ml_id(str(incoming.get("id_busca") or ""))
    open_url_in = _clean_url(str(incoming.get("open_url") or ""))
    preferred_check_url = _clean_url(str(incoming.get("check_url") or ""))
    preferred_canonical_url = _clean_url(str(incoming.get("canonical_url") or ""))
    norm = _normalize_ml_links(
        open_url_in,
        id_busca,
        preferred_check_url=preferred_check_url,
        preferred_canonical_url=preferred_canonical_url,
    )

    incoming["open_url"] = norm.get("open_url") or open_url_in
    incoming["check_url"] = norm.get("check_url") or incoming["open_url"]
    incoming["canonical_url"] = norm.get("canonical_url") or (_ml_search_url(id_busca) if id_busca else "")
    if norm.get("short_url"):
        incoming["short_url"] = norm.get("short_url")
    if norm.get("resolved_url"):
        incoming["resolved_url"] = norm.get("resolved_url")

    if incoming.get("image"):
        incoming["image"] = _normalize_asset_path(str(incoming.get("image") or ""))

    idx = next((i for i, p in enumerate(products) if isinstance(p, dict) and (p.get("sku") == sku)), None)

    if idx is None:
        idx2 = _find_existing_by_id_or_any_url(
            products,
            id_busca,
            [
                incoming.get("open_url"),
                incoming.get("check_url"),
                incoming.get("canonical_url"),
                incoming.get("short_url"),
                incoming.get("resolved_url"),
                incoming.get("alt_url"),
                incoming.get("relink_open_url"),
            ],
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

    preserve_keys = {"last_checked", "last_ok"}
    for k in preserve_keys:
        if k in existing and (not incoming.get(k)):
            incoming[k] = existing.get(k, "")

    core_fields = {
        "sku",
        "title",
        "open_url",
        "check_url",
        "canonical_url",
        "image",
        "active",
        "featured",
        "id_busca",
        "short_url",
        "resolved_url",
        "alt_url",
        "relink_open_url",
        "review_action",
        "review_status",
        "review_reason",
        "replacement_vendor",
        "notes",
        "issue_number",
        "issue_url",
        "issue_title",
        "categoria_principal",
        "categorias_secundarias",
        "aliases_busca",
        "quick_home",
        "quick_home_order",
    }

    for k, v in incoming.items():
        if k in core_fields:
            if v is None and k not in {"id_busca", "alt_url", "relink_open_url", "review_reason", "replacement_vendor", "notes"}:
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
    existing["review_action"] = _normalize_review_action(str(existing.get("review_action") or "manter"))
    existing["review_status"] = _normalize_review_status(str(existing.get("review_status") or ("ativo" if existing.get("active") else "em_revisao")))
    existing["review_reason"] = _clean_optional_text(str(existing.get("review_reason") or ""))
    existing["replacement_vendor"] = _clean_optional_text(str(existing.get("replacement_vendor") or ""))
    existing["notes"] = _clean_optional_text(str(existing.get("notes") or ""))
    existing["alt_url"] = _clean_url(str(existing.get("alt_url") or ""))
    existing["relink_open_url"] = _clean_url(str(existing.get("relink_open_url") or ""))
    existing["issue_number"] = _clean_issue_number(existing.get("issue_number") or incoming.get("issue_number") or incoming.get("_target_issue_number") or incoming.get("_source_issue_number"))
    existing["issue_url"] = _clean_url(str(existing.get("issue_url") or incoming.get("issue_url") or ""))
    existing["issue_title"] = _clean_optional_text(str(existing.get("issue_title") or incoming.get("issue_title") or ""))

    categoria_principal_existing = _clean_category_name(str(existing.get("categoria_principal") or ""))
    if categoria_principal_existing:
        existing["categoria_principal"] = categoria_principal_existing
    else:
        existing.pop("categoria_principal", None)

    categorias_secundarias_existing = existing.get("categorias_secundarias")
    if isinstance(categorias_secundarias_existing, list):
        sec_raw_existing = ",".join(str(x) for x in categorias_secundarias_existing)
    else:
        sec_raw_existing = str(categorias_secundarias_existing or "")
    sec_clean_existing = _clean_secondary_categories(sec_raw_existing)
    if sec_clean_existing:
        if categoria_principal_existing:
            sec_clean_existing = [x for x in sec_clean_existing if x.casefold() != categoria_principal_existing.casefold()]
        if sec_clean_existing:
            existing["categorias_secundarias"] = sec_clean_existing
        else:
            existing.pop("categorias_secundarias", None)
    else:
        existing.pop("categorias_secundarias", None)

    aliases_busca_existing = existing.get("aliases_busca")
    if isinstance(aliases_busca_existing, list):
        alias_raw_existing = ",".join(str(x) for x in aliases_busca_existing)
    else:
        alias_raw_existing = str(aliases_busca_existing or "")
    alias_clean_existing = _clean_search_aliases(alias_raw_existing)
    if alias_clean_existing:
        existing["aliases_busca"] = alias_clean_existing
    else:
        existing.pop("aliases_busca", None)

    if "quick_home" in existing:
        parsed_quick_home = existing.get("quick_home")
        if isinstance(parsed_quick_home, str):
            parsed_quick_home = _parse_optional_bool_text(parsed_quick_home)
        elif isinstance(parsed_quick_home, bool):
            parsed_quick_home = parsed_quick_home
        else:
            parsed_quick_home = bool(parsed_quick_home) if parsed_quick_home in {0, 1} else None

        if parsed_quick_home is None:
            existing.pop("quick_home", None)
        else:
            existing["quick_home"] = bool(parsed_quick_home)

    if "quick_home_order" in existing:
        existing["quick_home_order"] = _clean_order_int(existing.get("quick_home_order"), default=0)
        if existing["quick_home_order"] <= 0:
            existing.pop("quick_home_order", None)

    if existing.get("quick_home") is False:
        existing["quick_home_order"] = 0

    _enforce_active_featured_quick_home_consistency(existing)

    if existing.get("featured") is True:
        for p in products:
            if not isinstance(p, dict):
                continue
            if p.get("sku") != existing.get("sku"):
                p["featured"] = False

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

    repo_html_url = str((event.get("repository") or {}).get("html_url") or "").strip()
    products = data.get("products") or []
    target_issue_number = int(incoming.get("_target_issue_number") or incoming.get("_source_issue_number") or issue.get("number") or 0)
    for p in products:
        if not isinstance(p, dict):
            continue
        if (p.get("sku") or "") != (incoming.get("sku") or ""):
            continue
        p["issue_number"] = int(target_issue_number or 0)
        p["issue_url"] = _issue_url_from_repo(repo_html_url, target_issue_number) or _clean_url(str(issue.get("html_url") or ""))
        p["issue_title"] = _clean_optional_text(str(p.get("issue_title") or incoming.get("issue_title") or issue.get("title") or ""))
        break

    _write_json(PRODUTOS_JSON, data)

    print("OK: produtos.json atualizado.")
    print(f"SKU: {incoming.get('sku')}")
    print(f"Featured: {incoming.get('featured')}")
    print(f"Active: {incoming.get('active')}")
    print(f"Review Action: {incoming.get('review_action')}")
    print(f"Review Status: {incoming.get('review_status')}")
    print(f"Open URL: {incoming.get('open_url')}")
    print(f"Check URL: {incoming.get('check_url')}")
    print(f"Canonical URL: {incoming.get('canonical_url')}")
    print(f"ID Busca: {incoming.get('id_busca')}")
    print(f"Image: {incoming.get('image')}")
    if incoming.get("categoria_principal") is not None:
        print(f"Categoria Principal: {incoming.get('categoria_principal')}")
    if incoming.get("categorias_secundarias") is not None:
        print(f"Categorias Secundárias: {incoming.get('categorias_secundarias')}")
    if incoming.get("aliases_busca") is not None:
        print(f"Aliases Busca: {incoming.get('aliases_busca')}")
    if incoming.get("quick_home") is not None:
        print(f"Quick Home: {incoming.get('quick_home')}")
    if incoming.get("quick_home_order") is not None:
        print(f"Quick Home Order: {incoming.get('quick_home_order')}")
    if incoming.get("alt_url"):
        print(f"Alt URL: {incoming.get('alt_url')}")
    if incoming.get("relink_open_url"):
        print(f"Relink URL: {incoming.get('relink_open_url')}")
    if incoming.get("short_url"):
        print(f"Short URL: {incoming.get('short_url')}")
    if incoming.get("resolved_url"):
        print(f"Resolved URL: {incoming.get('resolved_url')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
