from copy import deepcopy

from tools.cms_produtos import _build_product_from_issue, _upsert_product


def _existing():
    return {
        "products": [
            {
                "sku": "gloss",
                "title": "Gloss feminino",
                "open_url": "https://meli.la/primary",
                "active_affiliate_url": "https://meli.la/primary",
                "affiliate_links": [{"url": "https://meli.la/primary", "status": "healthy"}],
                "active": True,
            }
        ]
    }


def test_editing_only_reserve_link_preserves_primary_link():
    incoming = {
        "sku": "gloss",
        "title": None,
        "open_url": None,
        "check_url": None,
        "canonical_url": None,
        "affiliate_links": [{"url": "https://meli.la/reserve", "status": "unknown"}],
        "active_affiliate_url": "https://meli.la/reserve",
        "_affiliate_link_slots": ["", "https://meli.la/reserve", "", "", ""],
        "_is_edit_mode": True,
    }

    result = _upsert_product(deepcopy(_existing()), incoming)
    product = result["products"][0]

    assert product["open_url"] == "https://meli.la/primary"
    assert product["active_affiliate_url"] == "https://meli.la/primary"
    assert [entry["url"] for entry in product["affiliate_links"]] == [
        "https://meli.la/primary",
        "https://meli.la/reserve",
    ]


def test_edit_without_links_does_not_erase_current_link():
    incoming = {
        "sku": "gloss",
        "title": "Gloss atualizado",
        "open_url": None,
        "check_url": None,
        "canonical_url": None,
        "_affiliate_link_slots": None,
        "_is_edit_mode": True,
    }

    result = _upsert_product(deepcopy(_existing()), incoming)
    product = result["products"][0]

    assert product["title"] == "Gloss atualizado"
    assert product["open_url"] == "https://meli.la/primary"


def test_admin_issue_contract_reads_five_links_and_promotional_image():
    links = [f"https://www.mercadolivre.com.br/produto-teste-{number}/p/MLB123456{number}" for number in range(1, 6)]
    body = "\n\n".join(
        [
            "### Título do Produto\n\nGloss feminino premium",
            "### SKU\n\ngloss-premium",
            "### Descrição Curta\n\nBrilho e hidratação para os lábios.",
            "### Categoria Principal\n\nMaquiagem",
            "### Categorias Secundárias (separe por vírgula)\n\nLábios, Gloss",
            "### Badges/Tags/Hashtags (separe por vírgula)\n\nbrilho, feminino",
            "### ID do Mercado Livre (MLB...)\n\nMLB1234561",
            *[
                f"### Link afiliado {index}{' — principal' if index == 1 else ' — reserva'}\n\n{link}"
                for index, link in enumerate(links, start=1)
            ],
            "### Arte promocional / redes sociais (URL opcional)\n\nhttps://example.com/social.webp",
            "### Preço atual (opcional)\n\nR$ 99,90",
            "### CTA de compra (opcional)\n\nComprar no Mercado Livre",
        ]
    )

    product = _build_product_from_issue({"number": 42, "title": "[CMS] Novo produto", "body": body})

    assert [entry["url"] for entry in product["affiliate_links"]] == links
    assert product["active_affiliate_url"] == links[0]
    assert product["image"] == "https://example.com/social.webp"
    assert product["price_text"] == "R$ 99,90"
