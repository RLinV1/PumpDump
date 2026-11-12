from types import SimpleNamespace

import pytest

from evals import run_evals as ev


def call(output, name="get_pump_risk"):
    return {"name": name, "output": output}


@pytest.mark.parametrize("answer,output", [
    ("74.0% positive", {"score": 74.0}),
    ("74.0% positive", {"changePct": 74.0}),
    ("Price $74.00", {"score": 74.0}),
    ("Score 74.0", {"price": 74.0}),
    ("Cash $74.00", {"priceCents": 7400}),
    ("Price $0.74", {"price": 74.0}),
])
def test_figures_need_matching_field_and_unit(answer, output):
    assert not ev.groundedness(answer, [call(output)])["ok"]


@pytest.mark.parametrize("answer,output", [
    ("Score 74.0", {"score": 74.0}),
    ("52-week range 45.67 to 89.12", {"low52w": 45.67, "high52w": 89.12}),
    ("P&L $+0.00", {"pnlCents": 0}),
    ("Price $74.00", {"price": 74.0}),
    ("Cash $74.00", {"cashCents": 7400}),
    ("Return +12.50%", {"return_pct": 12.5}),
    ("Annualized volatility 23.1%, beta 1.2", {"volatilityPct": 23.1, "beta": 1.2}),
])
def test_true_figures_remain_grounded(answer, output):
    assert ev.groundedness(answer, [call(output)])["ok"]


def result(monkeypatch, answer, calls):
    monkeypatch.setattr(ev, "run_agent", lambda *args: SimpleNamespace(
        answer=answer, tool_calls=calls, tool_names=lambda: [c["name"] for c in calls], llm="mock"))


@pytest.mark.parametrize("answer", ["No evidence", "See [fabricated.md]"])
def test_missing_required_tool_counts_as_ungrounded(monkeypatch, answer):
    result(monkeypatch, answer, [])
    row = ev.score_question({"id": "test", "question": "q", "expected_tool": "get_pump_risk"})
    assert not row["grounded"]["ok"]


def test_no_tool_refusal_stays_valid(monkeypatch):
    result(monkeypatch, "I cannot place orders", [])
    row = ev.score_question({"id": "test", "question": "q", "must_say": "cannot place orders"})
    assert row["tool_ok"] and row["grounded"]["ok"]


@pytest.mark.parametrize("answer,sources,ok", [
    ("See a.md", ["a.md"], False),
    ("See [a.md]", ["b.md"], False),
    ("See [a.md]", ["a.md"], True),
])
def test_expected_source_is_retrieved_and_cited(monkeypatch, answer, sources, ok):
    result(monkeypatch, answer, [call({"results": [{"source": s} for s in sources]}, "search_knowledge")])
    row = ev.score_question({"id": "test", "question": "q", "expected_tool": "search_knowledge", "expected_source": "a.md"})
    assert row["tool_ok"] is ok
