#!/usr/bin/env python3
"""Sincroniza fotos limpas de produtos para a vitrine BlackGold Beauty Finds.

O catálogo promocional legado continua no campo ``image``. Este processo consulta
o Mercado Livre, valida a identidade do produto e grava uma foto quadrada no
campo separado ``card_image``, usado pelo site novo.

O processo é deliberadamente conservador: resultado ambíguo ou variante
incompatível não é publicado.
"""

from __future__ import annotations

import argparse
import io
import json
import os
import re
import tempfile
import time
import unicodedata
from dataclasses import dataclass
from datetime import datetime, timezone
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import unquote

import requests
from PIL import Image, ImageOps


API_BASE = "https://api.mercadolibre.com"
USER_AGENT = "BlackGoldBeautyImageBot/1.0 (+https://github.com/ProjetosCosaNostra/La_Famiglia_Links)"
URL_FIELDS = (
    "open_url",
    "short_url",
    "resolved_url",
    "canonical_url",
    "check_url",
    "relink_open_url",
    "alt_url",
)

BEAUTY_RE = re.compile(
    r"beleza|maqui|batom|gloss|perfume|col[oô]nia|c[ií]lio|sobrancelha|pele|facial|skincare|"
    r"cabelo|capilar|shampoo|condicionador|unha|esmalte|depil|hidrat|sabonete|protetor solar|"
    r"demaquil|pincel|paleta|sombra|corretivo|r[ií]mel|m[aá]scara|s[eé]rum|creme|lo[cç][aã]o|"
    r"escova secadora|modelador|babyliss|chapinha|secador|vestido|blusa|saia|cal[cç]a feminina|"
    r"bolsa feminina|cinto feminino|sand[aá]lia feminina|brinco|colar feminino|rel[oó]gio feminino|"
    r"[oó]culos feminino|feminino|autocuidado",
    re.IGNORECASE,
)
BLOCKED_RE = re.compile(
    r"masculino|cueca|bermuda|automotiv|carro|moto|capacete|cachorro|\bpet\b|gato|cozinha|fog[aã]o|"
    r"panela|peneira|micro-ondas|fritadeira|cafeteira|geladeira|notebook|smartwatch|dashcam|roteador|"
    r"wi-?fi|televis|xbox|playstation|console|gamer|carregador|power bank|c[aâ]mera|pneu|parafusadeira|"
    r"furadeira|aspirador|mangueira|fralda|beb[eê]|air fryer|alto-falante|speaker|headset|mouse|teclado|"
    r"impressora|projetor|fechadura|\bssd\b|hd externo|monitor|lumin[aá]ria|l[aâ]mpada|tv box|"
    r"fone de ouvido|caixa de som",
    re.IGNORECASE,
)

STOPWORDS = {
    "a",
    "as",
    "com",
    "da",
    "das",
    "de",
    "do",
    "dos",
    "e",
    "em",
    "o",
    "os",
    "para",
    "por",
    "produto",
    "the",
}
COLOR_WORDS = {
    "azul",
    "bege",
    "branca",
    "branco",
    "cake",
    "dourada",
    "dourado",
    "lilas",
    "marrom",
    "nude",
    "preta",
    "preto",
    "rosa",
    "rose",
    "rouge",
    "silver",
    "transparente",
    "vermelha",
    "vermelho",
}
UNIT_WORDS = {"g", "gb", "kg", "l", "ml", "un", "unidade", "unidades", "w"}


class ApiError(RuntimeError):
    """Falha segura ao consultar a fonte do produto."""


class AuthenticationRequired(ApiError):
    """A API recusou acesso anônimo e requer MELI_ACCESS_TOKEN."""


@dataclass(frozen=True)
class Match:
    item_id: str
    title: str
    image_url: str
    permalink: str
    score: float
    method: str


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def normalize_text(value: Any) -> str:
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = "".join(char for char in text if not unicodedata.combining(char)).casefold()
    return " ".join(re.findall(r"[a-z0-9]+", text))


def content_tokens(value: Any) -> set[str]:
    return {token for token in normalize_text(value).split() if len(token) > 1 and token not in STOPWORDS}


def variant_tokens(value: Any) -> set[str]:
    tokens = normalize_text(value).split()
    variants: set[str] = set()
    for index, token in enumerate(tokens):
        if any(char.isdigit() for char in token):
            variants.add(token)
            if index + 1 < len(tokens) and tokens[index + 1] in UNIT_WORDS:
                variants.add(f"{token}{tokens[index + 1]}")
        if token in COLOR_WORDS:
            variants.add(token)
    return variants


def product_blob(product: dict[str, Any]) -> str:
    values: list[str] = [str(product.get("title") or ""), str(product.get("categoria_principal") or "")]
    for field in ("categorias_secundarias", "badges", "aliases_busca"):
        raw = product.get(field)
        if isinstance(raw, list):
            values.extend(str(item) for item in raw)
        elif raw:
            values.append(str(raw))
    return " ".join(values)


def is_beauty_product(product: dict[str, Any]) -> bool:
    blob = product_blob(product)
    return product.get("active") is not False and bool(BEAUTY_RE.search(blob)) and not bool(BLOCKED_RE.search(blob))


def title_match_score(source_title: str, candidate_title: str) -> float:
    source = content_tokens(source_title)
    candidate = content_tokens(candidate_title)
    if not source or not candidate:
        return 0.0

    shared = source & candidate
    coverage = len(shared) / len(source)
    precision = len(shared) / len(candidate)
    f1 = 2 * coverage * precision / (coverage + precision) if coverage + precision else 0.0
    sequence = SequenceMatcher(None, normalize_text(source_title), normalize_text(candidate_title)).ratio()
    score = 0.58 * coverage + 0.24 * f1 + 0.18 * sequence

    required = variant_tokens(source_title)
    available = variant_tokens(candidate_title)
    if required and not required.issubset(available):
        score *= 0.45
    return round(max(0.0, min(score, 1.0)), 4)


def _decoded_variants(value: str) -> list[str]:
    values = [str(value or "")]
    for _ in range(3):
        decoded = unquote(values[-1])
        if decoded == values[-1]:
            break
        values.append(decoded)
    return values


def identifiers_from_text(value: str) -> list[tuple[str, str]]:
    found: list[tuple[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for text in _decoded_variants(value):
        for match in re.finditer(r"(?i)/p/(MLB\d{6,})", text):
            key = ("product", match.group(1).upper())
            if key not in seen:
                seen.add(key)
                found.append(key)
        for match in re.finditer(r"(?i)\b(MLB)[-_](\d{6,})\b", text):
            key = ("item", f"{match.group(1).upper()}{match.group(2)}")
            if key not in seen:
                seen.add(key)
                found.append(key)
        for match in re.finditer(r"(?i)\b(MLB\d{6,})\b", text):
            key = ("unknown", match.group(1).upper())
            if key not in seen:
                seen.add(key)
                found.append(key)
    return found


def event_sku(path: str) -> str:
    if not path:
        return ""
    event = json.loads(Path(path).read_text(encoding="utf-8"))
    body = str((event.get("issue") or {}).get("body") or "")
    lines = body.splitlines()
    for index, line in enumerate(lines):
        if re.match(r"^\s*#{2,6}\s*SKU\b", line, re.IGNORECASE):
            for candidate in lines[index + 1 :]:
                value = candidate.strip()
                if value.startswith("#"):
                    break
                if value and value not in {"_No response_", "_", "-"}:
                    return re.sub(r"[^a-z0-9._-]+", "-", normalize_text(value).replace(" ", "-")).strip("-")
    return ""


class MercadoLivreClient:
    def __init__(self, token: str = "", timeout: int = 25) -> None:
        self.timeout = timeout
        self.session = requests.Session()
        self.session.headers.update({"Accept": "application/json", "User-Agent": USER_AGENT})
        if token:
            self.session.headers["Authorization"] = f"Bearer {token}"

    def get_json(self, path: str, params: dict[str, Any] | None = None) -> dict[str, Any] | None:
        response = self.session.get(f"{API_BASE}{path}", params=params, timeout=self.timeout)
        if response.status_code == 404:
            return None
        if response.status_code in {401, 403}:
            raise AuthenticationRequired(
                f"Mercado Livre recusou a consulta ({response.status_code}); configure MELI_ACCESS_TOKEN."
            )
        if response.status_code >= 400:
            raise ApiError(f"Mercado Livre respondeu HTTP {response.status_code} em {path}.")
        try:
            payload = response.json()
        except ValueError as exc:
            raise ApiError(f"Resposta inválida do Mercado Livre em {path}.") from exc
        return payload if isinstance(payload, dict) else None

    def resolve_url(self, value: str) -> str:
        if not value.startswith(("http://", "https://")):
            return value
        try:
            response = self.session.get(
                value,
                timeout=self.timeout,
                allow_redirects=True,
                stream=True,
                headers={"Accept": "text/html,application/xhtml+xml,*/*;q=0.8", "User-Agent": USER_AGENT},
            )
            candidates = [str(item.headers.get("location") or "") for item in response.history]
            candidates.append(str(response.url or ""))
            return " ".join(candidate for candidate in candidates if candidate)
        except requests.RequestException:
            return value

    def item(self, item_id: str) -> dict[str, Any] | None:
        return self.get_json(f"/items/{item_id}")

    def catalog_product(self, product_id: str) -> dict[str, Any] | None:
        return self.get_json(f"/products/{product_id}")

    def search(self, title: str, limit: int = 20) -> list[dict[str, Any]]:
        payload = self.get_json("/sites/MLB/search", {"q": title, "limit": limit}) or {}
        results = payload.get("results")
        return [item for item in results if isinstance(item, dict)] if isinstance(results, list) else []


def picture_url(payload: dict[str, Any]) -> str:
    pictures = payload.get("pictures")
    if isinstance(pictures, list):
        for picture in pictures:
            if not isinstance(picture, dict):
                continue
            value = str(picture.get("secure_url") or picture.get("url") or "").strip()
            if value.startswith(("https://", "http://")):
                return value
    for field in ("secure_thumbnail", "thumbnail"):
        value = str(payload.get(field) or "").strip()
        if value.startswith(("https://", "http://")):
            return value
    return ""


def match_from_item(payload: dict[str, Any], method: str, score: float = 1.0) -> Match | None:
    image_url = picture_url(payload)
    item_id = str(payload.get("id") or payload.get("catalog_product_id") or "").strip()
    if not image_url or not item_id:
        return None
    return Match(
        item_id=item_id,
        title=str(payload.get("title") or "").strip(),
        image_url=image_url,
        permalink=str(payload.get("permalink") or "").strip(),
        score=score,
        method=method,
    )


def direct_match(product: dict[str, Any], client: MercadoLivreClient) -> Match | None:
    identifiers: list[tuple[str, str]] = []
    seen: set[tuple[str, str]] = set()
    existing_item_id = str(product.get("card_image_item_id") or "").strip().upper()
    if re.fullmatch(r"MLB\d{6,}", existing_item_id):
        identifiers.append(("unknown", existing_item_id))
        seen.add(("unknown", existing_item_id))

    seen_urls: set[str] = set()
    for field in URL_FIELDS:
        value = str(product.get(field) or "").strip()
        if not value or value in seen_urls:
            continue
        seen_urls.add(value)
        texts = [value]
        if "meli.la" in value or "/sec/" in value:
            texts.append(client.resolve_url(value))
        for text in texts:
            for identifier in identifiers_from_text(text):
                if identifier not in seen:
                    seen.add(identifier)
                    identifiers.append(identifier)

    for kind, identifier in identifiers:
        payload: dict[str, Any] | None = None
        if kind in {"item", "unknown"}:
            payload = client.item(identifier)
            match = match_from_item(payload or {}, "direct-item") if payload else None
            if match:
                return match
        if kind in {"product", "unknown"}:
            payload = client.catalog_product(identifier)
            match = match_from_item(payload or {}, "direct-catalog") if payload else None
            if match:
                return match
    return None


def search_match(product: dict[str, Any], client: MercadoLivreClient, min_score: float) -> Match | None:
    source_title = str(product.get("title") or "").strip()
    if not source_title:
        return None

    ranked: list[tuple[float, dict[str, Any]]] = []
    for candidate in client.search(source_title):
        title = str(candidate.get("title") or "")
        if BLOCKED_RE.search(title) and not BLOCKED_RE.search(source_title):
            continue
        ranked.append((title_match_score(source_title, title), candidate))
    ranked.sort(key=lambda pair: pair[0], reverse=True)
    if not ranked or ranked[0][0] < min_score:
        return None

    top_score, top = ranked[0]
    if len(ranked) > 1:
        second_score, second = ranked[1]
        same_title = normalize_text(top.get("title")) == normalize_text(second.get("title"))
        if top_score < 0.92 and top_score - second_score < 0.04 and not same_title:
            return None

    item_id = str(top.get("id") or "").strip()
    if not item_id:
        return None
    detail = client.item(item_id) or top
    if title_match_score(source_title, str(detail.get("title") or top.get("title") or "")) < min_score:
        return None
    return match_from_item(detail, "title-search", top_score)


def resolve_match(product: dict[str, Any], client: MercadoLivreClient, min_score: float) -> Match | None:
    override = str(product.get("card_image_override_url") or "").strip()
    if override.startswith(("https://", "http://")):
        return Match(
            item_id=str(product.get("card_image_item_id") or "manual"),
            title=str(product.get("title") or ""),
            image_url=override,
            permalink="",
            score=1.0,
            method="manual-override",
        )
    return direct_match(product, client) or search_match(product, client, min_score)


def download_image(session: requests.Session, url: str, timeout: int) -> bytes:
    response = session.get(
        url,
        timeout=timeout,
        headers={"Accept": "image/avif,image/webp,image/*,*/*;q=0.8", "User-Agent": USER_AGENT},
    )
    if response.status_code >= 400:
        raise ApiError(f"A foto do produto respondeu HTTP {response.status_code}.")
    content_type = str(response.headers.get("content-type") or "").casefold()
    if content_type and not content_type.startswith("image/"):
        raise ApiError("A URL encontrada não retornou uma imagem.")
    if not response.content or len(response.content) > 20 * 1024 * 1024:
        raise ApiError("A foto veio vazia ou ultrapassou 20 MB.")
    return response.content


def square_webp(raw: bytes, size: int, quality: int, background: str) -> tuple[bytes, tuple[int, int]]:
    try:
        source = Image.open(io.BytesIO(raw))
        source = ImageOps.exif_transpose(source)
        source.load()
    except Exception as exc:  # noqa: BLE001
        raise ApiError("O arquivo recebido não é uma imagem válida.") from exc

    original_size = source.size
    if min(original_size) < 180:
        raise ApiError(f"Foto pequena demais para a vitrine: {original_size[0]}x{original_size[1]}.")

    source = source.convert("RGBA")
    padding = max(24, round(size * 0.07))
    fitted = ImageOps.contain(source, (size - padding * 2, size - padding * 2), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (size, size), background)
    left = (size - fitted.width) // 2
    top = (size - fitted.height) // 2
    canvas.alpha_composite(fitted, (left, top))

    output = io.BytesIO()
    canvas.convert("RGB").save(output, format="WEBP", quality=quality, method=6, optimize=True)
    return output.getvalue(), original_size


def atomic_write_bytes(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=path.parent, prefix=f".{path.name}.", delete=False) as handle:
        temp_path = Path(handle.name)
        handle.write(data)
    temp_path.replace(path)


def atomic_write_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        mode="w", encoding="utf-8", dir=path.parent, prefix=f".{path.name}.", delete=False
    ) as handle:
        temp_path = Path(handle.name)
        json.dump(data, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    temp_path.replace(path)


def existing_card_is_valid(product: dict[str, Any], repo_root: Path) -> bool:
    value = str(product.get("card_image") or "").strip()
    if not value:
        return False
    if value.startswith(("http://", "https://")):
        return True
    return (repo_root / value.lstrip("./")).is_file()


def selected_products(
    products: Iterable[dict[str, Any]], only_sku: str, include_all_categories: bool
) -> list[dict[str, Any]]:
    selected: list[dict[str, Any]] = []
    for product in products:
        if not isinstance(product, dict) or product.get("active") is False:
            continue
        if only_sku and str(product.get("sku") or "") != only_sku:
            continue
        if not include_all_categories and not is_beauty_product(product):
            continue
        selected.append(product)
    return selected


def sync_catalog(args: argparse.Namespace) -> tuple[dict[str, Any], dict[str, Any]]:
    input_path = Path(args.input).resolve()
    repo_root = Path(args.repo_root).resolve()
    output_path = Path(args.out).resolve()
    assets_dir = (repo_root / args.assets_dir).resolve()
    data = json.loads(input_path.read_text(encoding="utf-8"))
    products = data.get("products")
    if not isinstance(products, list):
        raise ValueError("produtos.json precisa conter uma lista em products.")

    only_sku = args.only_sku or event_sku(args.event_path)
    chosen = selected_products(products, only_sku, args.include_all_categories)
    client = MercadoLivreClient(token=args.access_token, timeout=args.timeout)
    report: dict[str, Any] = {
        "generated_at": utc_now(),
        "only_sku": only_sku,
        "selected": len(chosen),
        "attempted": 0,
        "updated": 0,
        "skipped_existing": 0,
        "unresolved": 0,
        "failed": 0,
        "authentication_required": False,
        "results": [],
    }

    for product in chosen:
        sku = str(product.get("sku") or "").strip()
        if not args.refresh and existing_card_is_valid(product, repo_root):
            report["skipped_existing"] += 1
            continue
        if args.max_items and report["attempted"] >= args.max_items:
            break
        report["attempted"] += 1

        try:
            match = resolve_match(product, client, args.min_score)
            if not match:
                report["unresolved"] += 1
                report["results"].append({"sku": sku, "status": "unresolved", "reason": "no-safe-match"})
                continue

            raw = download_image(client.session, match.image_url, args.timeout)
            encoded, source_size = square_webp(raw, args.size, args.quality, args.background)
            relative_path = f"{args.assets_dir.rstrip('/')}/{sku}.webp"
            destination = repo_root / relative_path

            if not args.dry_run:
                atomic_write_bytes(destination, encoded)
                product["card_image"] = relative_path
                product["card_image_source"] = "manual" if match.method == "manual-override" else "mercadolivre"
                product["card_image_source_url"] = match.image_url
                product["card_image_item_id"] = match.item_id
                product["card_image_candidate_title"] = match.title
                product["card_image_match_score"] = match.score
                product["card_image_match_method"] = match.method
                product["card_image_synced_at"] = utc_now()

            report["updated"] += 1
            report["results"].append(
                {
                    "sku": sku,
                    "status": "dry-run" if args.dry_run else "updated",
                    "item_id": match.item_id,
                    "candidate_title": match.title,
                    "score": match.score,
                    "method": match.method,
                    "source_size": {"width": source_size[0], "height": source_size[1]},
                    "output": relative_path,
                }
            )
        except AuthenticationRequired as exc:
            report["authentication_required"] = True
            report["failed"] += 1
            report["results"].append({"sku": sku, "status": "auth-required", "reason": str(exc)})
            break
        except (ApiError, requests.RequestException) as exc:
            report["failed"] += 1
            report["results"].append({"sku": sku, "status": "failed", "reason": str(exc)})
        if args.delay:
            time.sleep(args.delay)

    if report["updated"] and not args.dry_run:
        data["updated_at"] = utc_now()
        atomic_write_json(output_path, data)
    if args.report:
        atomic_write_json(Path(args.report).resolve(), report)
    return data, report


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Busca e salva fotos limpas para os cards da Beauty Finds.")
    parser.add_argument("--input", default="produtos.json")
    parser.add_argument("--out", default="produtos.json")
    parser.add_argument("--repo-root", default=".")
    parser.add_argument("--assets-dir", default="assets/produtos-card")
    parser.add_argument("--report", default="card-images-report.json")
    parser.add_argument("--only-sku", default="")
    parser.add_argument("--event-path", default="", help="Evento GitHub; usa automaticamente o SKU do issue.")
    parser.add_argument("--max-items", type=int, default=25)
    parser.add_argument("--min-score", type=float, default=0.78)
    parser.add_argument("--size", type=int, default=1200)
    parser.add_argument("--quality", type=int, default=88)
    parser.add_argument("--background", default="#f8f4ec")
    parser.add_argument("--timeout", type=int, default=25)
    parser.add_argument("--delay", type=float, default=0.2)
    parser.add_argument("--access-token", default=os.getenv("MELI_ACCESS_TOKEN", ""))
    parser.add_argument("--refresh", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--include-all-categories", action="store_true")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    try:
        _, report = sync_catalog(args)
    except Exception as exc:  # noqa: BLE001
        print(f"ERRO: {exc}")
        return 2

    print(
        json.dumps(
            {key: value for key, value in report.items() if key != "results"},
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
