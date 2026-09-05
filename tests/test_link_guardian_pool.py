import tools.link_guardian as guardian


def test_guardian_promotes_healthy_reserve_after_confirmed_failure():
    primary = "https://meli.la/primary"
    reserve = "https://meli.la/reserve"
    product = {
        "open_url": primary,
        "active_affiliate_url": primary,
        "affiliate_links": [
            {"url": primary, "status": "suspect", "fail_count": guardian.FAIL_THRESHOLD - 1},
            {"url": reserve, "status": "unknown", "fail_count": 0},
        ],
    }
    original_check = guardian._check_url
    original_sleep = guardian.time.sleep

    def fake_check(url):
        if url == primary:
            return guardian.CheckResult(False, False, 404, url, "dead", True, url, False)
        return guardian.CheckResult(True, False, 200, url, "ok", False, url, False)

    try:
        guardian._check_url = fake_check
        guardian.time.sleep = lambda _seconds: None
        result = guardian._check_affiliate_pool(product, "2026-09-05T09:00:00Z")
    finally:
        guardian._check_url = original_check
        guardian.time.sleep = original_sleep

    assert result is not None and result.ok is True
    assert product["active_affiliate_url"] == reserve
    assert product["open_url"] == reserve
    assert product["affiliate_previous_url"] == primary
    assert product["affiliate_links"][0]["status"] == "dead"
    assert product["affiliate_links"][1]["status"] == "healthy"
