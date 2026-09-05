from tools.publish_daily_campaign import publish


def test_dry_run_keeps_direct_link_and_does_not_persist_state():
    campaign = {
        "campaign_id": "bg-20260905",
        "selected": [{"sku": "gloss", "title": "Gloss", "affiliate_url": "https://meli.la/gloss"}],
    }
    state = {"version": 1, "published_campaigns": []}

    published = publish(
        campaign,
        state,
        token="",
        chat_id="",
        site_base="",
        max_posts=1,
        dry_run=True,
    )

    assert published == ["gloss"]
    assert state["published_campaigns"] == []


def test_same_campaign_is_not_published_twice():
    campaign = {
        "campaign_id": "bg-20260905",
        "selected": [{"sku": "gloss", "affiliate_url": "https://meli.la/gloss"}],
    }
    state = {"published_campaigns": ["bg-20260905"]}

    assert publish(campaign, state, token="", chat_id="", site_base="", max_posts=1, dry_run=True) == []
