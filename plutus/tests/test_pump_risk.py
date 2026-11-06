"""get_pump_risk, its mock-agent routing and the Pumpwatch assistant service, against a fake Pumpwatch API."""

from __future__ import annotations

import asyncio
import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from api import assistant_service as svc
from portfolio_risk import tools
from portfolio_risk.agent import mock_agent
from portfolio_risk.agent.base import AgentResult

WATCHLIST = [
    {"ticker": "GME", "score": 74, "modelVersion": "mock-rules-v1", "windowEnd": "2026-01-01T00:00:00Z", "staleSources": []},
    {"ticker": "SNDL", "score": 32, "modelVersion": "mock-rules-v1", "windowEnd": "2026-01-01T00:00:00Z", "staleSources": ["news"]},
]
FLAGS = [
    {"id": 2, "ticker": "GME", "raisedAt": "2026-01-01T00:00:00Z", "evidence": {
        "score": 74, "modelVersion": "mock-rules-v1", "postCount": 80, "tradeCount": 200,
        "topContributors": [{"featureGroup": "social", "delta": 30.0}], "catalyst": {"found": False, "items": []}}},
    {"id": 1, "ticker": "AMC", "raisedAt": "2026-01-01T00:00:00Z", "evidence": {
        "score": 66, "modelVersion": "mock-rules-v1", "postCount": 60, "tradeCount": 300,
        "topContributors": [], "catalyst": {"found": True, "items": ["earnings"]}}},
]


@pytest.fixture
def pumpwatch(monkeypatch):
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            data = {"/api/v1/watchlist": WATCHLIST, "/api/v1/flags?limit=100": FLAGS}.get(self.path)
            self.send_response(200 if data is not None else 404)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"notice": "n", "mode": "mock", "data": data}).encode())

        def log_message(self, *args):
            pass

    server = HTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    monkeypatch.setenv("PUMPWATCH_API_URL", f"http://127.0.0.1:{server.server_port}")
    yield
    server.shutdown()


def test_tracked_ticker_with_flag(pumpwatch):
    r = tools.get_pump_risk("gme")
    assert (r["ticker"], r["tracked"], r["score"], r["verdict"], r["data_mode"]) == ("GME", True, 74, "Pump likely", "mock")
    assert r["top_contributors"] == [{"featureGroup": "social", "delta": 30.0}]
    assert r["catalyst"] == {"found": False, "items": []}
    assert len(r["recent_flags"]) == 1


def test_untracked_ticker_with_flag_only_uses_flag_score(pumpwatch):
    r = tools.get_pump_risk("AMC")
    assert (r["tracked"], r["score"], r["verdict"]) == (False, 66, "Pump likely")
    assert r["catalyst"]["found"] is True


def test_unknown_ticker_and_stale_sources(pumpwatch):
    assert tools.get_pump_risk("ZZZ")["verdict"] == "Not scored"
    assert tools.get_pump_risk("SNDL")["stale_sources"] == ["news"]
    assert tools.get_pump_risk("SNDL")["verdict"] == "Low risk"


def test_errors_are_values_not_exceptions(monkeypatch):
    monkeypatch.delenv("PUMPWATCH_API_URL", raising=False)
    assert "not configured" in tools.get_pump_risk("GME")["error"]
    monkeypatch.setenv("PUMPWATCH_API_URL", "http://127.0.0.1:9")
    assert "unreachable" in tools.get_pump_risk("GME")["error"]
    assert "1 to 5 letters" in tools.get_pump_risk("not a ticker")["error"]


def test_mock_agent_routes_pump_questions(pumpwatch):
    r = mock_agent.run("Is GME being pumped?")
    assert r.tool_names() == ["get_pump_risk"]
    assert "74/100" in r.answer and "Pump likely" in r.answer and "mock data" in r.answer
    assert "not investment advice" in r.answer


def test_service_answer_has_tools_sources_and_notice(pumpwatch):
    out = svc.ask(svc.Ask(question="Is GME being pumped?"))
    assert out["tools_used"] == ["get_pump_risk"]
    assert out["sources"] == [{"kind": "pumpwatch", "title": "Pumpwatch risk score (mock data)", "url": None}]
    assert out["mode"] == {"data": "mock", "llm": "mock"}
    assert "not investment advice" in out["answer"].lower()


def test_service_appends_notice_when_the_answer_lacks_it(monkeypatch):
    monkeypatch.setattr(svc, "run_agent", lambda q: AgentResult(answer="Looks fine."))
    assert svc.ask(svc.Ask(question="x"))["answer"].endswith(svc.NOTICE)


def test_service_limits(monkeypatch):
    with pytest.raises(ValidationError):
        svc.Ask(question="x" * (svc.MAX_QUESTION + 1))
    with pytest.raises(ValidationError):
        svc.Ask(question="")
    monkeypatch.setattr(svc, "GLOBAL_PER_MINUTE", 2)
    svc._calls.clear()
    monkeypatch.setattr(svc, "run_agent", lambda q: AgentResult(answer="ok"))
    svc.ask(svc.Ask(question="a"))
    svc.ask(svc.Ask(question="b"))
    with pytest.raises(HTTPException) as e:
        svc.ask(svc.Ask(question="c"))
    assert e.value.status_code == 429
    svc._calls.clear()


def test_public_mode_refuses_portfolio_questions(monkeypatch):
    monkeypatch.setenv("PLUTUS_PUBLIC", "1")
    r = mock_agent.run("How risky is my portfolio?")
    assert r.tool_calls == [] and "not available" in r.answer


def test_portfolio_tools_are_the_hidden_set():
    from portfolio_risk.server import mcp_server

    names = {t.name for t in asyncio.run(mcp_server.mcp.list_tools())}
    assert "get_pump_risk" in names
    assert tools.PORTFOLIO_TOOLS <= names
