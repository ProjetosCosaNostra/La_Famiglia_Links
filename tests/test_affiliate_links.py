from tools.affiliate_links import apply_affiliate_contract, choose_active_affiliate_url, normalize_affiliate_links


def test_legacy_product_is_migrated_without_losing_primary_url():
    product = {"open_url": "https://meli.la/primary", "alt_url": "https://meli.la/reserve"}

    changed = apply_affiliate_contract(product)

    assert changed is True
    assert [item["url"] for item in product["affiliate_links"]] == [
        "https://meli.la/primary",
        "https://meli.la/reserve",
    ]
    assert product["active_affiliate_url"] == "https://meli.la/primary"


def test_healthy_fallback_replaces_dead_current_link():
    entries = normalize_affiliate_links(
        {},
        [
            {"url": "https://meli.la/dead", "status": "dead", "fail_count": 3},
            {"url": "https://meli.la/healthy", "status": "healthy"},
        ],
        include_legacy=False,
    )

    assert choose_active_affiliate_url(entries, "https://meli.la/dead") == "https://meli.la/healthy"


def test_link_pool_is_deduplicated_and_limited_to_five():
    entries = normalize_affiliate_links(
        {},
        [
            "https://meli.la/1",
            "https://meli.la/1",
            "https://meli.la/2",
            "https://meli.la/3",
            "https://meli.la/4",
            "https://meli.la/5",
            "https://meli.la/6",
        ],
        include_legacy=False,
    )

    assert [item["priority"] for item in entries] == [1, 2, 3, 4, 5]
    assert [item["url"] for item in entries] == [f"https://meli.la/{number}" for number in range(1, 6)]


def test_malformed_health_metadata_does_not_break_catalog():
    entries = normalize_affiliate_links(
        {},
        [{"url": "https://meli.la/1", "last_status": "invalid", "fail_count": "invalid"}],
        include_legacy=False,
    )

    assert entries[0]["last_status"] == 0
    assert entries[0]["fail_count"] == 0
