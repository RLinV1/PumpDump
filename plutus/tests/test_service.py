from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from api import service
from portfolio_risk import config
from portfolio_risk.lookup import mock_close

TOKEN = "t" * 40


@pytest.fixture
def client(db, monkeypatch):
    monkeypatch.setenv("PAPER_DB", str(db))
    return TestClient(service.app)


def post(client, path, body, token=TOKEN):
    return client.post(path, json=body, headers={"X-Paper-Token": token} if token else {})


def test_fill_price_comes_from_the_server_not_the_client(client):
    expected = round(mock_close("GME") * 100)
    r = post(client, "/paper/orders", {"side": "BUY", "ticker": "GME", "qty": 3, "price": 0.01})
    assert r.status_code == 200
    assert r.json()["fill"]["priceCents"] == expected  # the client's 0.01 was ignored
    assert r.json()["dataMode"] == "mock" and r.json()["simulated"] is True


def test_buy_then_sell_through_the_service(client):
    start = post(client, "/paper/account", {}).json()["cashCents"]
    post(client, "/paper/orders", {"side": "BUY", "ticker": "AMC", "qty": 10})
    mid = post(client, "/paper/account", {}).json()
    assert mid["cashCents"] < start and mid["positions"][0]["markCents"] is not None
    post(client, "/paper/orders", {"side": "SELL", "ticker": "AMC", "qty": 10})
    end = post(client, "/paper/account", {}).json()
    assert end["cashCents"] == start and end["positions"] == [] and len(end["orders"]) == 2


@pytest.mark.parametrize("body", [
    {"side": "HOLD", "ticker": "GME", "qty": 1}, {"side": "BUY", "ticker": "gme", "qty": 1},
    {"side": "BUY", "ticker": "GME", "qty": 0}, {"side": "BUY", "ticker": "GME", "qty": 1.5},
    {"side": "BUY", "ticker": "GME", "qty": 10_001}, {"side": "BUY", "ticker": "GME"},
])
def test_invalid_orders_are_422(client, body):
    assert post(client, "/paper/orders", body).status_code == 422


def test_token_is_required_and_checked(client):
    assert post(client, "/paper/account", {}, token=None).status_code == 401
    assert post(client, "/paper/account", {}, token="short").status_code == 401


def test_live_mode_without_a_quote_refuses_the_order(client, monkeypatch):
    monkeypatch.setenv("USE_MOCK_DATA", "0")
    assert not config.use_mock_data()
    r = post(client, "/paper/orders", {"side": "BUY", "ticker": "GME", "qty": 1})
    assert r.status_code == 503 and "refused" in r.json()["detail"]


def test_live_mode_fills_at_the_web_servers_quote(client, monkeypatch):
    monkeypatch.setenv("USE_MOCK_DATA", "0")
    r = post(client, "/paper/orders", {"side": "BUY", "ticker": "GME", "qty": 2, "price": 21.5})
    assert r.status_code == 200 and r.json()["fill"]["priceCents"] == 2150 and r.json()["dataMode"] == "live"
    assert post(client, "/paper/orders", {"side": "BUY", "ticker": "GME", "qty": 1, "price": -3}).status_code == 503


def test_reset(client):
    post(client, "/paper/orders", {"side": "BUY", "ticker": "GME", "qty": 1})
    out = post(client, "/paper/reset", {}).json()
    assert out["positions"] == [] and out["orders"] == []


def test_lookup_route(client):
    ok = client.get("/lookup/AAPL")
    assert ok.status_code == 200 and ok.json()["dataMode"] == "mock"
    assert client.get("/lookup/aapl").status_code == 400
    assert client.get("/healthz").json() == {"ok": True}
