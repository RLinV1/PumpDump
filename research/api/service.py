"""Pumpwatch private lookup and flag-assistant service. Only ``web/server.mjs`` talks to it; it publishes no port.

Run:  USE_MOCK_DATA=1 uvicorn api.service:app --host 0.0.0.0 --port 8090

The assistant explains Pumpwatch flags and risk. It is read-only and never gives buy or sell advice.
"""

from __future__ import annotations

import re
import threading
import time
from collections import deque

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from portfolio_risk import config
from portfolio_risk.agent.client import run_agent
from portfolio_risk.data.market_data import SOFT_ERRORS
from portfolio_risk.lookup import lookup

ASSISTANT_NOTICE = "Not investment advice. Pumpwatch is a non-commercial project."
MAX_QUESTION = 300
GLOBAL_PER_MINUTE = 30  # spend guard behind the web server's per-client limit: agent runs per minute in total
MAX_CONCURRENT_RUNS = 3  # each run is a ~110 MB subprocess; the per-minute cap limits starts, not how many live at once
MAX_SOURCES = 8
MAX_CONTEXT = 600

app = FastAPI(title="Pumpwatch lookup and flag assistant", docs_url=None, redoc_url=None, openapi_url=None)


@app.get("/healthz")
def healthz() -> dict:
    return {"ok": True}


@app.get("/lookup/{ticker}")
def get_lookup(ticker: str) -> dict:
    if not re.fullmatch(r"[A-Z]{1,5}", ticker):
        raise HTTPException(status_code=400, detail="A ticker is 1 to 5 capital letters.")
    try:
        return lookup(ticker)
    except SOFT_ERRORS:  # never leak provider or stack details
        raise HTTPException(status_code=404, detail=f"No data for {ticker}.") from None


# --- Research assistant. Read-only tools only; the web server validates and rate-limits before anything reaches here. ---
class Ask(BaseModel):
    question: str = Field(min_length=1, max_length=MAX_QUESTION)
    context: str | None = Field(default=None, max_length=MAX_CONTEXT)  # the flag on screen: ticker, score, evidence


_calls: deque[float] = deque()
_lock = threading.Lock()
_slots = threading.BoundedSemaphore(MAX_CONCURRENT_RUNS)


def _allow(now: float) -> bool:
    with _lock:
        while _calls and now - _calls[0] > 60:
            _calls.popleft()
        if len(_calls) >= GLOBAL_PER_MINUTE:
            return False
        _calls.append(now)
        return True


def _sources(calls: list[dict], data_mode: str) -> list[dict]:
    """What the answer rests on: knowledge files, headlines, Pumpwatch, the sentiment model, plus a line per other tool."""
    out: list[dict] = []
    seen: set[str] = set()

    def add(kind: str, title: str, url: str | None = None) -> None:
        if title and title not in seen and len(out) < MAX_SOURCES:
            seen.add(title)
            out.append({"kind": kind, "title": title[:140], "url": url if url and url.startswith(("http://", "https://")) else None})

    for call in calls:
        name, res = call["name"], call.get("output")
        res = res if isinstance(res, dict) else {}
        if "error" in res:
            continue
        if name == "search_knowledge":
            for r in res.get("results", []):
                add("knowledge", str(r.get("source", "")))
        elif name == "get_pump_risk":
            add("pumpwatch", f"Pumpwatch rules-v1 risk score ({res.get('data_mode', 'live')} data)")
            if (res.get("sentiment") or {}).get("available"):
                add("sentiment", "FinTwitBERT sentiment (context only)")
        elif name == "get_sentiment":
            if res.get("available"):
                add("sentiment", "FinTwitBERT sentiment (context only)")
        elif "articles" in res:
            for a in res["articles"]:
                add("news", str(a.get("title", "")), a.get("url"))
        else:
            add("data", f"{name} ({data_mode} market data)")
    return out


@app.post("/assistant/ask")
def ask(body: Ask) -> dict:
    question = body.question.strip()
    if not question:
        raise HTTPException(status_code=422, detail="Empty question.")
    if not _slots.acquire(blocking=False):
        raise HTTPException(status_code=429, detail="Assistant is busy. Try again shortly.")
    try:
        if not _allow(time.monotonic()):
            raise HTTPException(status_code=429, detail="Busy. Try again in a minute.")
        result = run_agent(question, (body.context or "").strip())
    except HTTPException:
        raise
    except Exception:  # noqa: BLE001  (never leak provider or stack details to the browser)
        raise HTTPException(status_code=502, detail="The assistant could not answer. Try again.") from None
    finally:
        _slots.release()
    answer = result.answer.strip()
    if "not investment advice" not in answer.lower():
        answer += f"\n\n{ASSISTANT_NOTICE}"
    data_mode = "mock" if config.use_mock_data() else "live"
    return {
        "answer": answer, "tools_used": result.tool_names(), "sources": _sources(result.tool_calls, data_mode),
        "mode": {"data": data_mode, "llm": result.llm}, "note": result.note, "notice": ASSISTANT_NOTICE,
    }
