"""The assistant's read-only tools against mock data and a fake Pumpwatch web server."""

from __future__ import annotations

import contextvars
import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import pandas as pd
import pytest

from evals import fixtures
from portfolio_risk import config, paper, tools

TOKEN = "t" * 40


@pytest.fixture
def pumpwatch(monkeypatch):
    server, url = fixtures.serve()
    monkeypatch.setenv("PUMPWATCH_API_URL", url)
    yield url
    server.shutdown()


@pytest.fixture
def sentiment_ready(monkeypatch):
    """A web server whose sentiment model is running and has classified 7 posts."""
    ready = {**fixtures.SENTIMENT_OFF, "enabled": True, "model": "x", "modelStatus": "ready", "positive": 4, "neutral": 2,
             "negative": 1, "total": 7, "sample": {"sort": "top", "examined": 30}}

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            data = ready if self.path.split("?")[0].endswith("/sentiment") else {"/api/v1/watchlist": fixtures.WATCHLIST, "/api/v1/flags": fixtures.FLAGS}.get(self.path.split("?")[0])
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"notice": "n", "mode": "live", "data": data}).encode())

        def log_message(self, *args):
            pass

    server = HTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    monkeypatch.setenv("PUMPWATCH_API_URL", f"http://127.0.0.1:{server.server_port}")
    yield
    server.shutdown()


def test_lookup_tools_use_the_same_numbers():
    snap, perf = tools.get_stock_snapshot("aapl"), tools.get_price_performance("AAPL", "6mo")
    assert snap["ticker"] == "AAPL" and snap["dataMode"] == "mock"
    assert perf["return_pct"] is not None and perf["period"] == "6mo"
    assert tools.get_technical_indicators("AAPL")["sma200"] is not None
    assert tools.explain_stock_risk("TSLA")["beta"] is not None
    assert len(tools.compare_stocks(["AAPL", "MSFT"])["stocks"]) == 2


def test_bad_input_becomes_an_error_dict():
    assert "error" in tools.get_stock_snapshot("not a ticker")
    assert "error" in tools.get_price_performance("AAPL", "10y")
    assert "error" in tools.compare_stocks(["AAPL"])
    assert "error" in tools.get_ticker_news("../etc")


def test_price_move_reports_insufficient_history(monkeypatch):
    prices = pd.Series([100.0, 101.0], index=pd.bdate_range("2026-01-01", periods=2))
    monkeypatch.setattr(tools, "_prices", lambda *args: prices)
    assert "insufficient" in tools.explain_price_move("NEW", "1y")["error"].lower()


def test_one_day_move_keeps_single_observation_fallback(monkeypatch):
    prices = pd.Series([100.0], index=pd.bdate_range("2026-01-01", periods=1))
    monkeypatch.setattr(tools, "_prices", lambda *args: prices)
    result = tools.explain_price_move("NEW", "1d")
    assert result["move_pct"] == 0.0


def test_mock_paper_account_has_current_valuation(db, monkeypatch):
    monkeypatch.setenv("PAPER_DB", str(db))
    paper.place_order(db, TOKEN, "BUY", "AAPL", 1, 10000)
    tools.set_paper_token(TOKEN)
    try:
        account = tools.get_paper_account()
        assert account["valuation_available"] is True
        assert account["positions"][0]["markCents"] is not None
        assert account["totalCents"] is not None
    finally:
        tools.set_paper_token("")


def test_live_paper_answer_does_not_claim_unmarked_pnl(db, monkeypatch):
    from portfolio_risk.agent import mock_agent

    monkeypatch.setenv("PAPER_DB", str(db))
    paper.place_order(db, TOKEN, "BUY", "AAPL", 1, 10000)
    monkeypatch.setenv("USE_MOCK_DATA", "0")
    tools.set_paper_token(TOKEN)
    try:
        account = tools.get_paper_account()
        assert account["valuation_available"] is False
        assert account["totalCents"] is None and account["pnlCents"] is None
        assert account["positions"][0]["markCents"] is None
        assert "priceCents" not in account["positions"][0]
        answer = mock_agent.run("Show my paper account").answer
        assert "unavailable" in answer.lower() and "P&L $" not in answer
    finally:
        tools.set_paper_token("")


def test_mock_news_is_labelled_synthetic_and_flagged_untrusted():
    out = tools.get_ticker_news("AAPL", 3)
    assert len(out["articles"]) == 3 and "not a real article" in out["articles"][0]["summary"].lower()
    assert "not instructions" in out["note"].lower()
    assert tools.explain_price_move("AAPL", "1w")["articles"]


def test_pump_risk_tracked_ticker_with_honest_mock_sentiment(pumpwatch):
    r = tools.get_pump_risk("gme")
    assert (r["ticker"], r["tracked"], r["score"], r["verdict"], r["data_mode"]) == ("GME", True, 74, "Pump likely", "mock")
    assert r["top_contributors"][0]["featureGroup"] == "social" and r["catalyst"] == {"found": False, "items": []}
    s = r["sentiment"]
    assert s["available"] is False and "no sentiment has been estimated" in s["reason"].lower()
    assert "positive" not in s and "predicts" in s["note"]  # no invented counts; labelled as context


def test_pump_risk_untracked_and_unreachable(pumpwatch, monkeypatch):
    r = tools.get_pump_risk("AAPL")
    assert r["tracked"] is False and r["score"] is None and r["verdict"] == "Not scored"
    monkeypatch.setenv("PUMPWATCH_API_URL", "http://127.0.0.1:1")
    assert "unreachable" in tools.get_pump_risk("GME")["error"]
    monkeypatch.delenv("PUMPWATCH_API_URL")
    assert "not configured" in tools.get_pump_risk("GME")["error"]


def test_sentiment_counts_come_from_the_model_endpoint(sentiment_ready):
    s = tools.get_sentiment("GME")
    assert (s["available"], s["positive"], s["neutral"], s["negative"], s["classified"]) == (True, 4, 2, 1, 7)
    assert s["model"] == "FinTwitBERT"
    risk = tools.get_pump_risk("GME")
    assert risk["score"] == 74 and risk["sentiment"]["positive"] == 4  # attached, and the score is untouched


def test_paper_tools_read_only(db, monkeypatch):
    monkeypatch.setenv("PAPER_DB", str(db))
    assert "no paper account" in tools.get_paper_account()["error"]
    tools.set_paper_token(TOKEN)
    acct = tools.get_paper_account()
    assert acct["cashCents"] == paper.START_CASH_CENTS and acct["simulated"] is True
    assert tools.get_paper_orders()["orders"] == []
    assert not config.use_mock_data() or acct["data_mode"] == "mock"
    tools.set_paper_token("")


def test_no_tool_can_trade():
    assert all(n.startswith(("get_", "explain_", "compare_", "search_")) for n in tools.READ_ONLY_TOOLS)
    assert not [n for n in dir(tools) if n.startswith(("place_", "buy_", "sell_", "reset_"))]


def test_standalone_paper_tools_use_environment_token(db, monkeypatch):
    monkeypatch.setenv("PAPER_DB", str(db))
    monkeypatch.setenv("RESEARCH_PAPER_TOKEN", TOKEN)
    account = contextvars.Context().run(tools.get_paper_account)
    assert account["cashCents"] == paper.START_CASH_CENTS
