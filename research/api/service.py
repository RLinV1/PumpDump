"""Pumpwatch private lookup and paper-trading service. Only ``web/server.mjs`` talks to it; it publishes no port.

Run:  USE_MOCK_DATA=1 uvicorn api.service:app --host 0.0.0.0 --port 8090

Fill prices are decided here. Mock mode uses the same mock close the lookup shows. Live mode (your own
machine only) requires the web server to pass an Alpaca quote it fetched itself; the browser never sends
a price. With no price available the order is refused. Nothing here is a broker or investment advice.
"""

from __future__ import annotations

import math
import re
import threading
import time
from collections import deque

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from portfolio_risk import config, paper
from portfolio_risk.agent.client import run_agent
from portfolio_risk.data.market_data import SOFT_ERRORS
from portfolio_risk.lookup import lookup, mock_close

NOTICE = "Simulated paper trading with no real orders. Not investment advice."
ASSISTANT_NOTICE = "Not investment advice. Pumpwatch is a non-commercial project."
MAX_QUESTION = 300
GLOBAL_PER_MINUTE = 30  # spend guard behind the web server's per-client limit: agent runs per minute in total
MAX_SOURCES = 8
MAX_PRICE = 10_000_000.0
MAX_MARKS = 30

app = FastAPI(title="Pumpwatch lookup, paper trading and research assistant", docs_url=None, redoc_url=None, openapi_url=None)


class Order(BaseModel):
    side: str = Field(pattern="^(BUY|SELL)$")
    ticker: str = Field(pattern=r"^[A-Z]{1,5}$")
    qty: int = Field(ge=1, le=paper.MAX_QTY, strict=True)
    price: float | None = None  # live mode only: the web server's own Alpaca quote


class Marks(BaseModel):
    marks: dict[str, float] = Field(default_factory=dict, max_length=MAX_MARKS)


def _db():
    config.ensure_dirs()
    return config.paper_db_path()


def _cents(value) -> int | None:
    if isinstance(value, bool) or not isinstance(value, int | float) or not math.isfinite(value) or not 0 < value <= MAX_PRICE:
        return None
    return round(value * 100)


def fill_price(ticker: str, supplied: float | None) -> int | None:
    """Price in cents decided by the server, or None when there is no honest price."""
    if config.use_mock_data():
        try:
            return _cents(mock_close(ticker))
        except SOFT_ERRORS:
            return None
    return _cents(supplied)


def mark_prices(tickers: list[str], supplied: dict[str, float]) -> dict[str, int]:
    out: dict[str, int] = {}
    for t in tickers[:MAX_MARKS]:
        cents = fill_price(t, supplied.get(t))
        if cents is not None:
            out[t] = cents
    return out


def _wrap(call):
    try:
        return call()
    except paper.PaperError as exc:
        raise HTTPException(status_code=exc.status, detail=str(exc)) from None


def _body(account: dict) -> dict:
    return {**account, "dataMode": "mock" if config.use_mock_data() else "live", "simulated": True, "notice": NOTICE}


def _token(value: str | None) -> str:
    return value or ""


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


@app.get("/paper/holdings")
def holdings(x_paper_token: str | None = Header(default=None)) -> dict:
    return {"tickers": _wrap(lambda: paper.held_tickers(_db(), _token(x_paper_token)))}


@app.post("/paper/account")
def account(body: Marks, x_paper_token: str | None = Header(default=None)) -> dict:
    token = _token(x_paper_token)

    def run():
        tickers = paper.held_tickers(_db(), token)
        return paper.get_account(_db(), token, mark_prices(tickers, body.marks))

    return _body(_wrap(run))


@app.post("/paper/orders")
def order(body: Order, x_paper_token: str | None = Header(default=None)) -> dict:
    token = _token(x_paper_token)
    price = fill_price(body.ticker, body.price)
    if price is None:
        raise HTTPException(status_code=503, detail=f"No price is available for {body.ticker}, so the order was refused.")

    def run():
        marks = mark_prices(paper.held_tickers(_db(), token), {})
        return paper.place_order(_db(), token, body.side, body.ticker, body.qty, price, marks)

    return {**_body(_wrap(run)), "fill": {"side": body.side, "ticker": body.ticker, "qty": body.qty, "priceCents": price}}


@app.post("/paper/reset")
def reset(x_paper_token: str | None = Header(default=None)) -> dict:
    return _body(_wrap(lambda: paper.reset_account(_db(), _token(x_paper_token))))


# --- Research assistant. Read-only tools only; the web server validates and rate-limits before anything reaches here. ---
class Ask(BaseModel):
    question: str = Field(min_length=1, max_length=MAX_QUESTION)


_calls: deque[float] = deque()
_lock = threading.Lock()


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
        elif name.startswith("get_paper"):
            add("paper", "Your simulated paper account")
        elif "articles" in res:
            for a in res["articles"]:
                add("news", str(a.get("title", "")), a.get("url"))
        else:
            add("data", f"{name} ({data_mode} market data)")
    return out


@app.post("/assistant/ask")
def ask(body: Ask, x_paper_token: str | None = Header(default=None)) -> dict:
    question = body.question.strip()
    if not question:
        raise HTTPException(status_code=422, detail="Empty question.")
    if not _allow(time.monotonic()):
        raise HTTPException(status_code=429, detail="Busy. Try again in a minute.")
    token = x_paper_token if x_paper_token and paper.TOKEN.match(x_paper_token) else ""
    try:
        result = run_agent(question, token)
    except Exception:  # noqa: BLE001  (never leak provider or stack details to the browser)
        raise HTTPException(status_code=502, detail="The assistant could not answer. Try again.") from None
    answer = result.answer.strip()
    if "not investment advice" not in answer.lower():
        answer += f"\n\n{ASSISTANT_NOTICE}"
    data_mode = "mock" if config.use_mock_data() else "live"
    return {
        "answer": answer, "tools_used": result.tool_names(), "sources": _sources(result.tool_calls, data_mode),
        "mode": {"data": data_mode, "llm": result.llm}, "note": result.note, "notice": ASSISTANT_NOTICE,
    }
