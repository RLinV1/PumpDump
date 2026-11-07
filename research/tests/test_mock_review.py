"""Regressions for assistant routing and evidence attribution from PR review."""

import pytest

from api import service
from portfolio_risk import tools
from portfolio_risk.agent import mock_agent


@pytest.mark.parametrize(("question", "expected"), [
    ("WHAT DOES AAPL DO?", ["AAPL"]),
    ("What does Apple do?", ["AAPL"]),
    ("WHAT DOES APPLE DO?", ["AAPL"]),
    ("Google / Alphabet", ["GOOGL"]),
    ("What is MSFT and $AI?", ["MSFT", "AI"]),
    ("What is $AI?", ["AI"]),
    ("What is $DO?", ["DO"]),
    ("Tell me about Scamazon", []),
])
def test_tickers_do_not_treat_question_words_as_symbols(question, expected):
    assert mock_agent._tickers(question) == expected


@pytest.mark.parametrize(("question", "tool", "ticker"), [
    ("WHAT DOES AAPL DO?", "search_knowledge", "AAPL"),
    ("What does Apple do?", "search_knowledge", "AAPL"),
    ("What should I watch out for with Microsoft?", "search_knowledge", "MSFT"),
    ("Why is AAPL volatile?", "explain_stock_risk", "AAPL"),
    ("Why is AAPL below its moving average?", "get_technical_indicators", "AAPL"),
    ("Why did Apple move today?", "explain_price_move", "AAPL"),
    ("Why did AAPL fall on news today?", "explain_price_move", "AAPL"),
    ("Tell me about Nvidia", "get_stock_snapshot", "NVDA"),
    ("What is AAPL's price?", "get_stock_snapshot", "AAPL"),
])
def test_specific_intent_routes_before_generic_why(monkeypatch, question, tool, ticker):
    monkeypatch.setattr(tools, tool, lambda **kwargs: {"error": "offline"})
    result = mock_agent.run(question)
    assert result.tool_names() == [tool]
    assert result.tool_calls[0]["input"]["ticker"] == ticker


def test_multiple_tickers_request_clarification_unless_comparing(monkeypatch):
    result = mock_agent.run("What is the price of AAPL and MSFT?")
    assert result.tool_calls == []
    assert "which ticker" in result.answer.lower()
    monkeypatch.setattr(tools, "compare_stocks", lambda **kwargs: {"error": "offline"})
    assert mock_agent.run("Compare AAPL and MSFT").tool_names() == ["compare_stocks"]


@pytest.mark.parametrize("tool", ["get_sentiment", "get_pump_risk"])
def test_sources_name_the_actual_sentiment_model(tool):
    sentiment = {"available": True, "model": "FinTwitBERT"}
    output = sentiment if tool == "get_sentiment" else {"sentiment": sentiment}
    sources = service._sources([{"name": tool, "output": output}], "mock")
    assert next(s for s in sources if s["kind"] == "sentiment")["title"] == "FinTwitBERT sentiment (context only)"


def test_move_does_not_claim_recent_news_is_period_filtered():
    answer = mock_agent._move({"ticker": "AAPL", "move_pct": 1, "direction": "up", "period": "1y",
                               "window_start": "2024-01-01", "window_end": "2025-01-01",
                               "articles": [{"title": "Recent news"}]})
    assert "Recent headlines" in answer
    assert "from the period" not in answer


@pytest.mark.parametrize("tracked", [True, False])
def test_historical_flag_does_not_supply_current_score_or_signals(monkeypatch, tracked):
    flag = {"ticker": "GME", "raisedAt": "2024-01-02T00:00:00Z", "evidence": {
        "score": 88, "postCount": 10, "tradeCount": 20,
        "topContributors": [{"featureGroup": "social", "delta": 30}],
        "catalyst": {"found": True, "items": ["old headline"]}}}
    row = {"ticker": "GME", "score": 22, "windowEnd": "2025-01-02T00:00:00Z"}
    monkeypatch.setenv("PUMPWATCH_API_URL", "http://unused")
    monkeypatch.setattr(tools, "_pumpwatch_get", lambda base, path: ([row] if tracked else [], "mock")
                        if path.endswith("watchlist") else ([flag], "mock"))
    monkeypatch.setattr(tools, "get_sentiment", lambda ticker: {"available": False, "reason": "Unavailable.", "note": "Context only."})
    output = tools.get_pump_risk("GME")
    assert output["score"] == (22 if tracked else None)
    assert output["top_contributors"] == []
    assert output["catalyst"] is None
    assert output["recent_flags"][0]["score"] == 88
    answer = mock_agent._pump(output)
    assert "historical flag" in answer.lower()
    assert "2024-01-02T00:00:00Z" in answer and "88 of 100" in answer
    if tracked:
        assert "22 of 100" in answer and "Current signal breakdown unavailable" in answer
    else:
        assert "does not currently score" in answer
