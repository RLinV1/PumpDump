"""Pumpwatch research-assistant service: the only Plutus surface that is exposed to the web app.

Deliberately NOT ``api.server``: that app carries portfolios, billing, Stripe and Clerk. This one
has two routes, no state, and no portfolio tools (PLUTUS_PUBLIC=1 hides them from the agent).

Run:  PLUTUS_PUBLIC=1 uvicorn api.assistant_service:app --host 0.0.0.0 --port 8090
"""

from __future__ import annotations

import threading
import time
from collections import deque

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from portfolio_risk import config
from portfolio_risk.agent.client import run_agent

NOTICE = "Not investment advice. Pumpwatch is a non-commercial project."
MAX_QUESTION = 300
# Spend guard behind the web server's per-client limit: at most this many agent runs per minute in total.
GLOBAL_PER_MINUTE = 30
MAX_SOURCES = 8

app = FastAPI(title="Pumpwatch research assistant", docs_url=None, redoc_url=None, openapi_url=None)

_calls: deque[float] = deque()
_lock = threading.Lock()


class Ask(BaseModel):
    question: str = Field(min_length=1, max_length=MAX_QUESTION)


def _allow(now: float) -> bool:
    with _lock:
        while _calls and now - _calls[0] > 60:
            _calls.popleft()
        if len(_calls) >= GLOBAL_PER_MINUTE:
            return False
        _calls.append(now)
        return True


def _sources(calls: list[dict], data_mode: str) -> list[dict]:
    """What the answer rests on: knowledge docs, headlines, Pumpwatch, plus a line per other data tool."""
    out: list[dict] = []
    seen: set[str] = set()

    def add(kind: str, title: str, url: str | None = None) -> None:
        if title and title not in seen and len(out) < MAX_SOURCES:
            seen.add(title)
            out.append({"kind": kind, "title": title[:140], "url": url if url and url.startswith(("http://", "https://")) else None})

    for call in calls:
        name, res = call["name"], call.get("output")
        res = res if isinstance(res, dict) else {}
        if name == "search_knowledge":
            for r in res.get("results", []):
                add("knowledge", str(r.get("source", "")))
        elif name == "get_pump_risk" and "error" not in res:
            add("pumpwatch", f"Pumpwatch risk score ({res.get('data_mode', 'live')} data)")
        elif "articles" in res:
            for a in res["articles"]:
                add("news", str(a.get("title", "")), a.get("url"))
        elif "error" not in res:
            add("data", f"{name} ({data_mode} market data)")
    return out


@app.get("/healthz")
def healthz() -> dict:
    return {"ok": True}


@app.post("/assistant/ask")
def ask(body: Ask) -> dict:
    question = body.question.strip()
    if not question:
        raise HTTPException(status_code=422, detail="Empty question.")
    if not _allow(time.monotonic()):
        raise HTTPException(status_code=429, detail="Busy. Try again in a minute.")
    try:
        result = run_agent(question)
    except Exception:  # noqa: BLE001  (never leak provider or stack details to the browser)
        raise HTTPException(status_code=502, detail="The assistant could not answer. Try again.") from None
    answer = result.answer.strip()
    if "not investment advice" not in answer.lower():
        answer += f"\n\n{NOTICE}"
    data_mode = "mock" if config.use_mock_data() else "live"
    return {
        "answer": answer,
        "tools_used": result.tool_names(),
        "sources": _sources(result.tool_calls, data_mode),
        "mode": {"data": data_mode, "llm": "mock" if config.use_mock_llm() else "claude"},
        "notice": NOTICE,
    }
