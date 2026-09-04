from __future__ import annotations

import io
import tempfile
import unittest
from pathlib import Path

from PIL import Image

from tools.sync_product_card_images import (
    event_sku,
    identifiers_from_text,
    is_beauty_product,
    search_match,
    square_webp,
    title_match_score,
)


class FakeClient:
    def __init__(self, results: list[dict], details: dict[str, dict]) -> None:
        self.results = results
        self.details = details

    def search(self, title: str, limit: int = 20) -> list[dict]:
        del title, limit
        return self.results

    def item(self, item_id: str) -> dict | None:
        return self.details.get(item_id)


class ProductImageSyncTests(unittest.TestCase):
    def test_extracts_item_and_catalog_ids_from_urls(self) -> None:
        text = (
            "https://produto.mercadolivre.com.br/MLB-3670297668-produto-_JM "
            "https://www.mercadolivre.com.br/p/MLB12345678"
        )
        self.assertIn(("item", "MLB3670297668"), identifiers_from_text(text))
        self.assertIn(("product", "MLB12345678"), identifiers_from_text(text))

    def test_match_score_rejects_wrong_variant(self) -> None:
        source = "Cicaplast Baume B5 Plus La Roche Posay 40ml"
        exact = "Cicaplast Baume B5+ La Roche-Posay 40 ml"
        wrong = "Cicaplast Baume B5+ La Roche-Posay 100 ml"
        self.assertGreater(title_match_score(source, exact), 0.78)
        self.assertLess(title_match_score(source, wrong), 0.5)

    def test_only_womens_beauty_scope_is_selected(self) -> None:
        self.assertTrue(
            is_beauty_product(
                {
                    "active": True,
                    "title": "Gloss Labial Bruna Tavares",
                    "categoria_principal": "Beleza",
                }
            )
        )
        self.assertFalse(
            is_beauty_product(
                {
                    "active": True,
                    "title": "Escova Pet a Vapor 3 em 1",
                    "categoria_principal": "Beleza e cuidado",
                }
            )
        )
        self.assertFalse(is_beauty_product({"active": True, "title": "Notebook gamer"}))

    def test_search_chooses_exact_product(self) -> None:
        source = {"title": "Gloss Fran Liphoney Mel 5ml"}
        results = [
            {"id": "MLB100000001", "title": "Gloss Fran Liphoney Mel 5 ml"},
            {"id": "MLB100000002", "title": "Gloss Fran Liphoney Morango 5 ml"},
        ]
        details = {
            "MLB100000001": {
                "id": "MLB100000001",
                "title": "Gloss Fran Liphoney Mel 5 ml",
                "permalink": "https://produto.mercadolivre.com.br/MLB-100000001",
                "pictures": [{"secure_url": "https://http2.mlstatic.com/clean.jpg"}],
            }
        }
        match = search_match(source, FakeClient(results, details), 0.78)
        self.assertIsNotNone(match)
        self.assertEqual(match.item_id, "MLB100000001")

    def test_event_sku_reads_issue_form(self) -> None:
        payload = '{"issue":{"body":"## SKU (único)\\n\\nmeu-produto-01\\n\\n## Título\\nProduto"}}'
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "event.json"
            path.write_text(payload, encoding="utf-8")
            self.assertEqual(event_sku(str(path)), "meu-produto-01")

    def test_square_webp_has_expected_canvas(self) -> None:
        source = Image.new("RGB", (400, 800), "white")
        raw = io.BytesIO()
        source.save(raw, format="PNG")
        encoded, original_size = square_webp(raw.getvalue(), 1200, 88, "#f8f4ec")
        result = Image.open(io.BytesIO(encoded))
        self.assertEqual(original_size, (400, 800))
        self.assertEqual(result.size, (1200, 1200))
        self.assertEqual(result.format, "WEBP")


if __name__ == "__main__":
    unittest.main()
