"""Mock agent routing, the Gemini loop against a fake client, the MCP server's tool list and the assistant route.

No real Gemini call is made anywhere in the tests: the fake client below stands in for google.genai.Client.
"""

from __future__ import annotations

import asyncio
import os
import sys
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from api import service
from evals import fixtures
from evals.run_evals import groundedness
from portfolio_risk import config, tools
from portfolio_risk.agent import client as agent_client
from portfolio_risk.agent import mock_agent
from portfolio_risk.agent.base import AgentResult


@pytest.fixture
def pumpwatch(monkeypatch):
    server, url = fixtures.serve()
    monkeypatch.setenv("PUMPWATCH_API_URL", url)
    yield
    server.shutdown()


def names(question):
    return mock_agent.run(question).tool_names()


def test_mock_agent_routes_to_the_right_tool(pumpwatch):
    assert names("Is GME being pumped?") == ["get_pump_risk"]
    assert names("What is the Bluesky sentiment on GME?") == ["get_sentiment"]
    assert names("Compare Apple and Microsoft") == ["compare_stocks"]
    assert names("Why did Apple move today?") == ["explain_price_move"]
    assert names("What is a pump and dump?") == ["search_knowledge"]
    assert names("Tell me about Nvidia") == ["get_stock_snapshot"]


def test_mock_agent_refuses_to_trade_and_uses_no_tool():
    r = mock_agent.run("Buy 100 shares of GME for me")
    assert r.tool_calls == [] and "cannot place orders" in r.answer


def test_mock_agent_declines_advice_and_explains_flags(pumpwatch):
    advice = mock_agent.run("Should I buy GME before it pumps?")
    assert advice.tool_calls == [] and "cannot place orders or give buy, sell or hold advice" in advice.answer
    flagged = mock_agent.run("Why is GME flagged?")
    assert [c["name"] for c in flagged.tool_calls] == ["get_pump_risk"] and "74 of 100" in flagged.answer


def test_mock_pump_answer_keeps_sentiment_as_context(pumpwatch):
    answer = mock_agent.run("Is GME being pumped?").answer
    assert "74 of 100" in answer and "Pump likely" in answer and "not a price prediction" in answer
    assert "Sentiment context" in answer and "not being collected" in answer


# --- Gemini loop with a fake client ----------------------------------------------------------------------------------
class FakeModels:
    def __init__(self, script):
        self.script, self.requests = list(script), []

    async def generate_content(self, *, model, contents, config):
        self.requests.append({"model": model, "n": len(contents), "tools": config.tools})
        return self.script.pop(0)


def reply(text=None, calls=()):
    fcs = [SimpleNamespace(name=n, args=a) for n, a in calls]
    return SimpleNamespace(function_calls=fcs or None, text=text, candidates=[SimpleNamespace(content=SimpleNamespace(role="model", parts=[]))])


def fake_client(script):
    models = FakeModels(script)
    return SimpleNamespace(aio=SimpleNamespace(models=models)), models


def test_gemini_loop_calls_tools_then_answers():
    client, models = fake_client([reply(calls=[("get_pump_risk", {"ticker": "GME"})]), reply("GME scores 74 of 100. Not investment advice.")])
    seen = []

    async def call_tool(name, args):
        seen.append((name, args))
        return {"score": 74}

    r = asyncio.run(agent_client.gemini_loop(client, [], call_tool, "Is GME being pumped?", "gemini-test"))
    assert seen == [("get_pump_risk", {"ticker": "GME"})]
    assert r.llm == "gemini" and r.tool_names() == ["get_pump_risk"] and "74" in r.answer
    assert models.requests[0]["model"] == "gemini-test"


def test_gemini_loop_is_bounded():
    endless = [reply(calls=[("get_sentiment", {"ticker": "GME"})]) for _ in range(10)] + [reply("done")]
    client, models = fake_client(endless)

    async def call_tool(name, args):
        return {"ok": True}

    r = asyncio.run(agent_client.gemini_loop(client, [], call_tool, "q", "m", max_steps=3))
    assert len(r.tool_calls) == 3  # three tool turns, then one final call with tools off
    assert len(models.requests) == 4 and models.requests[-1]["tools"] is None


def test_gemini_loop_caps_calls_per_turn():
    client, _ = fake_client([reply(calls=[("get_sentiment", {"ticker": "GME"})] * 7), reply("ok")])
    ran = []

    async def call_tool(name, args):
        ran.append(name)
        return {}

    r = asyncio.run(agent_client.gemini_loop(client, [], call_tool, "q", "m"))
    assert len(ran) == agent_client.MAX_CALLS_PER_TURN and len(r.tool_calls) == 7


def test_auto_mode_is_mock_without_a_key_and_gemini_with_one(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("USE_MOCK_LLM", raising=False)
    assert config.use_mock_llm() is True
    monkeypatch.setenv("GEMINI_API_KEY", "x")
    assert config.use_mock_llm() is False
    monkeypatch.setenv("USE_MOCK_LLM", "1")
    assert config.use_mock_llm() is True


def test_gemini_models_put_env_first_and_dedupe(monkeypatch):
    monkeypatch.delenv("GEMINI_MODEL", raising=False)
    assert config.gemini_models() == list(config.GEMINI_MODELS_DEFAULT)
    monkeypatch.setenv("GEMINI_MODEL", "gemini-other")
    assert config.gemini_models() == ["gemini-other", *config.GEMINI_MODELS_DEFAULT]
    monkeypatch.setenv("GEMINI_MODEL", config.GEMINI_MODELS_DEFAULT[1])
    assert config.gemini_models() == [config.GEMINI_MODELS_DEFAULT[1], config.GEMINI_MODELS_DEFAULT[0], config.GEMINI_MODELS_DEFAULT[2]]


def _rotate(errors_by_model):
    """Run rotate_models over fake models; a value that is an exception is raised, otherwise returned as the answer."""
    tried = []

    async def run(model):
        tried.append(model)
        out = errors_by_model[model]
        if isinstance(out, Exception):
            raise out
        return AgentResult(answer=out, tool_calls=[], llm="gemini")

    return tried, lambda: asyncio.run(agent_client.rotate_models(list(errors_by_model), run))


def _client_error(code):
    from google.genai import errors
    return errors.ClientError(code, {"error": {"message": "x", "status": "S"}})


@pytest.mark.parametrize("code", [404, 429])
def test_rotation_moves_to_next_model_on_retired_or_quota(code):
    tried, go = _rotate({"a": _client_error(code), "b": "from b"})
    assert go().answer == "from b" and tried == ["a", "b"]


def test_rotation_moves_on_server_error():
    from google.genai import errors
    tried, go = _rotate({"a": errors.ServerError(503, {"error": {"message": "x", "status": "S"}}), "b": "from b"})
    assert go().answer == "from b"


def test_rotation_raises_other_errors_at_once():
    tried, go = _rotate({"a": _client_error(400), "b": "from b"})
    with pytest.raises(Exception) as info:
        go()
    assert info.value.code == 400 and tried == ["a"]


def test_rotation_raises_last_error_when_all_fail():
    tried, go = _rotate({"a": _client_error(404), "b": _client_error(429)})
    with pytest.raises(Exception) as info:
        go()
    assert info.value.code == 429 and tried == ["a", "b"]


def test_gemini_failure_falls_back_to_the_labelled_mock(monkeypatch, pumpwatch):
    monkeypatch.setenv("GEMINI_API_KEY", "x")
    monkeypatch.delenv("USE_MOCK_LLM", raising=False)

    async def boom(question, context):
        raise RuntimeError("secret detail")

    monkeypatch.setattr(agent_client, "_run_gemini", boom)
    r = agent_client.run_agent("Is GME being pumped?")
    assert r.llm == "mock" and "unavailable" in r.note and "secret" not in r.note and r.tool_names() == ["get_pump_risk"]


# --- MCP server over stdio ---------------------------------------------------------------------------------------------
def test_mcp_server_lists_exactly_the_read_only_tools():
    from mcp import ClientSession
    from mcp.client.stdio import StdioServerParameters, stdio_client

    async def listing():
        params = StdioServerParameters(command=sys.executable, args=["-m", "portfolio_risk.server.mcp_server"], env=dict(os.environ))
        async with stdio_client(params) as (r, w), ClientSession(r, w) as session:
            await session.initialize()
            return {t.name for t in (await session.list_tools()).tools}

    got = asyncio.run(listing())
    assert got == set(tools.READ_ONLY_TOOLS)
    assert "get_pump_risk" in got and "get_sentiment" in got and "search_knowledge" in got


# --- Assistant route -------------------------------------------------------------------------------------------------
@pytest.fixture
def http(monkeypatch, pumpwatch):
    monkeypatch.setenv("USE_MOCK_LLM", "1")
    service._calls.clear()
    return TestClient(service.app)


def test_route_answers_with_notice_sources_and_llm_label(http):
    r = http.post("/assistant/ask", json={"question": "Is GME being pumped?"})
    body = r.json()
    assert r.status_code == 200 and body["mode"] == {"data": "mock", "llm": "mock"}
    assert body["tools_used"] == ["get_pump_risk"] and "not investment advice" in body["answer"].lower()
    assert body["sources"][0]["kind"] == "pumpwatch"


def test_route_limits_and_validation(http, monkeypatch):
    clock = SimpleNamespace(t=0.0)
    calls = []
    # Control only the service limiter clock; do not freeze worker/async deadlines.
    monkeypatch.setattr(service, "time", SimpleNamespace(monotonic=lambda: clock.t))

    def answer(question, context):
        calls.append(question)
        return AgentResult(answer="Rate-limit fixture")

    monkeypatch.setattr(service, "run_agent", answer)
    assert http.post("/assistant/ask", json={"question": "x" * 301}).status_code == 422
    assert http.post("/assistant/ask", json={"question": ""}).status_code == 422
    for _ in range(service.GLOBAL_PER_MINUTE):
        assert http.post("/assistant/ask", json={"question": "What is a P/E ratio?"}).status_code == 200
    assert http.post("/assistant/ask", json={"question": "What is a P/E ratio?"}).status_code == 429
    assert len(calls) == service.GLOBAL_PER_MINUTE
    clock.t = 60.01
    assert http.post("/assistant/ask", json={"question": "What is a P/E ratio?"}).status_code == 200
    assert len(calls) == service.GLOBAL_PER_MINUTE + 1


def test_fourth_concurrent_run_gets_429(http, monkeypatch):
    import threading

    started, release = threading.Semaphore(0), threading.Event()

    def slow(question, context):
        started.release()
        release.wait(5)
        return AgentResult(answer="ok")

    monkeypatch.setattr(service, "run_agent", slow)
    codes = []
    threads = [threading.Thread(target=lambda: codes.append(http.post("/assistant/ask", json={"question": "q"}).status_code))
               for _ in range(service.MAX_CONCURRENT_RUNS)]
    for t in threads:
        t.start()
    for _ in threads:
        assert started.acquire(timeout=5)
    assert http.post("/assistant/ask", json={"question": "q"}).status_code == 429
    release.set()
    for t in threads:
        t.join()
    assert codes == [200] * service.MAX_CONCURRENT_RUNS
    assert http.post("/assistant/ask", json={"question": "q"}).status_code == 200  # slot freed


def test_route_passes_the_flag_context_to_the_agent(http, monkeypatch):
    seen = []
    monkeypatch.setattr(service, "run_agent", lambda question, context: seen.append((question, context)) or AgentResult(answer="ok"))
    assert http.post("/assistant/ask", json={"question": "Why?", "context": " GME score 74 "}).status_code == 200
    assert http.post("/assistant/ask", json={"question": "Why?"}).status_code == 200
    assert http.post("/assistant/ask", json={"question": "Why?", "context": "x" * 601}).status_code == 422
    assert seen == [("Why?", "GME score 74"), ("Why?", "")]


def test_groundedness_catches_fabricated_citations_and_figures():
    calls = [{"name": "search_knowledge", "output": {"results": [{"source": "a.md", "text": "x"}]}}, {"name": "get_pump_risk", "output": {"score": 74.0}}]
    assert groundedness("Score 74.0 [a.md]", calls)["ok"]
    assert groundedness("See [b.md]", calls)["fabricated_citations"] == ["b.md"]
    assert groundedness("It is up 12.5%", calls)["unsupported_figures"] == ["12.5%"]
    assert groundedness("no citation", calls)["uncited"]
