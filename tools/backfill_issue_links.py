# ==========================================================
# Arquivo: tools/backfill_issue_links.py
# Objetivo:
#   Preencher issue_number / issue_url / issue_title nos produtos
#   existentes do produtos.json, buscando as issues CMS no GitHub.
#
# Uso esperado:
#   - Rodar via GitHub Actions no branch gh-pages
#   - Requer:
#       GITHUB_TOKEN
#       GITHUB_REPOSITORY  (ex.: usuario/repo)
# ==========================================================

from __future__ import annotations

import json
import os
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

REPO_ROOT = Path(__file__).resolve().parents[1]
PRODUTOS_JSON = REPO_ROOT / "produtos.json"

GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "").strip()
GITHUB_REPOSITORY = os.environ.get("GITHUB_REPOSITORY", "").strip()

CMS_LABELS = {
    "cms-produtos",
    "cms-editar-produto",
    "cms-produto-do-dia",
}

HEADERS = {
    "Accept": "application/vnd.github+json",
    "Authorization": f"Bearer {GITHUB_TOKEN}",
    "User-Agent": "CosaNostra-Issue-Backfill/1.0",
}


def _clean_text(s: str) -> str:
    return (s or "").strip()


def _read_json(path: Path) -> Dict[str, Any]:
    if not path.exists():
        raise FileNotFoundError(f"Arquivo não encontrado: {path}")
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def _write_json(path: Path, data: Dict[str, Any]) -> None:
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")


def _github_get(url: str) -> Any:
    req = urllib.request.Request(url, headers=HEADERS, method="GET")
    with urllib.request.urlopen(req, timeout=30) as resp:
        raw = resp.read()
    return json.loads(raw.decode("utf-8"))


def _fetch_all_issues(repo: str) -> List[Dict[str, Any]]:
    issues: List[Dict[str, Any]] = []
    page = 1
    while True:
        url = (
            f"https://api.github.com/repos/{repo}/issues"
            f"?state=all&per_page=100&page={page}"
        )
        batch = _github_get(url)
        if not isinstance(batch, list) or not batch:
            break
        for item in batch:
            if not isinstance(item, dict):
                continue
            if "pull_request" in item:
                continue
            issues.append(item)
        if len(batch) < 100:
            break
        page += 1
    return issues


def _extract_section(body: str, headings: List[str]) -> str:
    text = body or ""
    for heading in headings:
        pattern = re.compile(
            rf"(?ims)^\s*(?:###|##)\s*{heading}\s*$\n+(.+?)(?=\n^\s*(?:###|##)\s+|\Z)"
        )
        m = pattern.search(text)
        if m:
            value = m.group(1).strip()
            # keep only first logical line for plain values
            lines = [ln.strip() for ln in value.splitlines() if ln.strip()]
            if lines:
                return lines[0]
            return value
    return ""


def _extract_issue_target(body: str) -> int:
    raw = _extract_section(
        body,
        [
            r"N[uú]mero da issue original do produto",
            r"Target Issue Number",
            r"Issue original",
        ],
    )
    raw = re.sub(r"[^\d]", "", raw or "")
    try:
        return int(raw or 0)
    except Exception:
        return 0


def _extract_sku(body: str) -> str:
    return _extract_section(
        body,
        [
            r"SKU do produto que j[aá] existe",
            r"SKU\s*\(ú?nico\)",
            r"SKU",
        ],
    )


def _is_cms_issue(issue: Dict[str, Any]) -> bool:
    labels = issue.get("labels") or []
    label_names = set()
    for lb in labels:
        if isinstance(lb, dict):
            name = _clean_text(str(lb.get("name") or "")).lower()
            if name:
                label_names.add(name)
        elif isinstance(lb, str):
            label_names.add(lb.lower())
    if label_names & CMS_LABELS:
        return True

    title = _clean_text(str(issue.get("title") or ""))
    return title.startswith("[CMS]")


def _build_issue_maps(issues: List[Dict[str, Any]]) -> Tuple[Dict[int, Dict[str, Any]], Dict[str, Dict[str, Any]]]:
    issue_by_number: Dict[int, Dict[str, Any]] = {}
    sku_to_issue: Dict[str, Dict[str, Any]] = {}

    for issue in issues:
        if not _is_cms_issue(issue):
            continue

        number = int(issue.get("number") or 0)
        if number <= 0:
            continue

        issue_by_number[number] = issue

    for issue in issues:
        if not _is_cms_issue(issue):
            continue

        body = str(issue.get("body") or "")
        sku = _clean_text(_extract_sku(body))
        if not sku:
            continue

        current_number = int(issue.get("number") or 0)
        target_number = _extract_issue_target(body)
        original_number = target_number if target_number > 0 else current_number

        original_issue = issue_by_number.get(original_number) or issue
        original_url = _clean_text(str(original_issue.get("html_url") or ""))
        original_title = _clean_text(str(original_issue.get("title") or ""))

        # Prefer mapping that points to a real original issue
        current = sku_to_issue.get(sku)
        new_payload = {
            "issue_number": int(original_number),
            "issue_url": original_url,
            "issue_title": original_title,
        }

        if current is None:
            sku_to_issue[sku] = new_payload
            continue

        # Prefer non-zero issue numbers and original non-edit titles when possible
        if int(new_payload.get("issue_number") or 0) > int(current.get("issue_number") or 0):
            sku_to_issue[sku] = new_payload

    return issue_by_number, sku_to_issue


def main() -> int:
    if not GITHUB_TOKEN:
        print("ERRO: GITHUB_TOKEN não definido.")
        return 1

    if not GITHUB_REPOSITORY:
        print("ERRO: GITHUB_REPOSITORY não definido.")
        return 1

    data = _read_json(PRODUTOS_JSON)
    products = data.get("products") or []
    if not isinstance(products, list):
        print("ERRO: produtos.json inválido (products não é lista).")
        return 1

    issues = _fetch_all_issues(GITHUB_REPOSITORY)
    _, sku_to_issue = _build_issue_maps(issues)

    touched = 0
    matched = 0

    for p in products:
        if not isinstance(p, dict):
            continue

        sku = _clean_text(str(p.get("sku") or ""))
        if not sku:
            continue

        mapping = sku_to_issue.get(sku)
        if not mapping:
            continue

        matched += 1

        old_number = int(p.get("issue_number") or 0)
        old_url = _clean_text(str(p.get("issue_url") or ""))
        old_title = _clean_text(str(p.get("issue_title") or ""))

        new_number = int(mapping.get("issue_number") or 0)
        new_url = _clean_text(str(mapping.get("issue_url") or ""))
        new_title = _clean_text(str(mapping.get("issue_title") or ""))

        changed = False
        if old_number != new_number:
            p["issue_number"] = new_number
            changed = True
        if old_url != new_url:
            p["issue_url"] = new_url
            changed = True
        if old_title != new_title:
            p["issue_title"] = new_title
            changed = True

        if changed:
            touched += 1

    data["products"] = products
    _write_json(PRODUTOS_JSON, data)

    print("========================================")
    print("BACKFILL ISSUE LINKS FINALIZADO")
    print("========================================")
    print(f"Issues CMS lidas: {len(issues)}")
    print(f"SKUs com mapeamento de issue: {len(sku_to_issue)}")
    print(f"Produtos com match: {matched}")
    print(f"Produtos atualizados: {touched}")
    print(f"Arquivo: {PRODUTOS_JSON}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
