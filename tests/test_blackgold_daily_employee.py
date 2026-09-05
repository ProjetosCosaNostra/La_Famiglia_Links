from datetime import date

from tools.blackgold_daily_employee import build_campaign, merge_observed_stats, select_daily_products


def _product(sku: str, title: str, category: str = "Beleza e Cuidado Pessoal"):
    return {
        "sku": sku,
        "title": title,
        "categoria_principal": category,
        "active": True,
        "open_url": f"https://meli.la/{sku}",
        "card_image": f"assets/produtos-card/{sku}.webp",
        "promo_text": "Achado feminino selecionado",
        "price_text": "R$ 99,90",
    }


def test_employee_never_selects_old_out_of_niche_products():
    products = [
        _product("gloss", "Gloss labial feminino"),
        _product("serum", "Sérum facial para pele"),
        _product("shampoo", "Shampoo capilar feminino"),
        _product("notebook", "Notebook gamer", "Tecnologia"),
        _product("panela", "Panela de cozinha", "Casa"),
    ]
    learning = {"products": {}}

    selected = select_daily_products(products, learning, date(2026, 9, 5), count=3)

    assert {row["product"]["sku"] for row in selected} == {"gloss", "serum", "shampoo"}


def test_employee_does_not_publish_legacy_promotional_art():
    product = _product("gloss", "Gloss labial feminino")
    product["card_image"] = ""
    product["image"] = "assets/produtos-webp/arte-antiga.webp"

    selected = select_daily_products([product], {"products": {}}, date(2026, 9, 5), count=1)

    assert selected == []


def test_observed_clicks_are_imported_and_affect_learning_memory():
    learning = {"products": {}}
    merge_observed_stats(learning, {"rows": [{"sku": "gloss", "impressions": 120, "clicks": 18}]})

    assert learning["products"]["gloss"]["impressions"] == 120
    assert learning["products"]["gloss"]["clicks"] == 18


def test_campaign_has_direct_affiliate_links_and_updates_selection_memory():
    products = [_product("gloss", "Gloss labial feminino")]
    learning = {"products": {}}
    selected = select_daily_products(products, learning, date(2026, 9, 5), count=1)

    campaign = build_campaign(selected, learning, date(2026, 9, 5))

    assert campaign["selected"][0]["affiliate_url"] == "https://meli.la/gloss"
    assert campaign["selected"][0]["position"] == 1
    assert learning["products"]["gloss"]["last_selected"] == "2026-09-05"
