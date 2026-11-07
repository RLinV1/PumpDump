"""Request deadlines terminate synchronous work rather than leaving background threads."""
from __future__ import annotations

import asyncio
import multiprocessing
import threading
import time
from pathlib import Path

import pytest

from portfolio_risk import config, tools
from portfolio_risk.agent import client, mock_agent
from portfolio_risk.agent.base import AgentResult


def slow_mock(question):
    path = Path(question)
    path.with_suffix(".started").write_text("started")
    time.sleep(8)
    path.write_text("completed")
    return AgentResult(answer="too late")


def token_mock(question):
    return AgentResult(answer=tools.get_paper_account().get("error", "account exists"))


@pytest.mark.parametrize("fallback", [False, True])
def test_slow_mock_and_fallback_stop_within_shared_deadline(monkeypatch, tmp_path, fallback):
    monkeypatch.setenv("USE_MOCK_LLM", "0" if fallback else "1")
    monkeypatch.setattr(config, "ASSISTANT_TIMEOUT_SEC", 6.0)
    monkeypatch.setattr(mock_agent, "run", slow_mock)

    async def unavailable(question, token):
        await asyncio.sleep(2)
        raise RuntimeError("provider secret")

    monkeypatch.setattr(client, "_run_gemini", unavailable)
    before = {p.pid for p in multiprocessing.active_children()}
    threads = {t.ident for t in threading.enumerate()}
    completed = tmp_path / "completed.txt"
    started = time.monotonic()
    with pytest.raises(TimeoutError):
        client.run_agent(str(completed))
    assert time.monotonic() - started < 6.8
    assert completed.with_suffix(".started").exists(), "slow tool must actually have started"
    assert not completed.exists()
    assert {p.pid for p in multiprocessing.active_children()} == before
    assert {t.ident for t in threading.enumerate()} == threads


def test_exhausted_gemini_budget_does_not_start_fallback(monkeypatch, tmp_path):
    monkeypatch.setenv("USE_MOCK_LLM", "0")
    monkeypatch.setattr(config, "ASSISTANT_TIMEOUT_SEC", 0.1)
    monkeypatch.setattr(mock_agent, "run", slow_mock)
    cancelled = []

    async def stalled(question, token):
        try:
            await asyncio.sleep(10)
        finally:
            cancelled.append(True)

    monkeypatch.setattr(client, "_run_gemini", stalled)
    marker = tmp_path / "completed.txt"
    with pytest.raises(TimeoutError):
        client.run_agent(str(marker))
    assert cancelled == [True]
    assert not marker.with_suffix(".started").exists()


def test_mock_worker_restores_paper_token(monkeypatch, tmp_path):
    from portfolio_risk import paper

    monkeypatch.setenv("USE_MOCK_LLM", "1")
    db = tmp_path / "paper.db"
    monkeypatch.setenv("PAPER_DB", str(db))
    token = "t" * 40
    paper.get_account(db, token)
    monkeypatch.setattr(mock_agent, "run", token_mock)
    assert client.run_agent("account", token).answer == "account exists"
    assert "account" in client.run_agent("account").answer.lower()


def test_normal_mock_response_survives_process_boundary(monkeypatch):
    monkeypatch.setenv("USE_MOCK_LLM", "1")
    result = client.run_agent("Buy 100 shares of GME")
    assert result.llm == "mock"
    assert "cannot place orders" in result.answer



def failed_mock(question):
    raise RuntimeError("private provider credentials")


def test_worker_failure_does_not_expose_provider_message(monkeypatch, capsys):
    monkeypatch.setenv("USE_MOCK_LLM", "1")
    monkeypatch.setattr(mock_agent, "run", failed_mock)
    with pytest.raises(RuntimeError, match="^Assistant worker failed$"):
        client.run_agent("q")
    captured = capsys.readouterr()
    assert "private" not in captured.out + captured.err
