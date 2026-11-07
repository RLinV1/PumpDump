"""Deterministic offline "agent": the zero-key fallback. It runs the full tool pipeline with no LLM.

It reads the question with keyword rules, calls one shared tool, and writes a plain answer from the tool's result. It is
not an LLM, so it is labelled ``mock`` everywhere. With ``GEMINI_API_KEY`` set, ``client.py`` uses Gemini instead.
Everything here is educational, not investment advice.
"""

from __future__ import annotations

import re

from .. import tools
from .base import AgentResult

_NAMES = {
    "apple": "AAPL", "microsoft": "MSFT", "nvidia": "NVDA", "tesla": "TSLA", "amazon": "AMZN",
    "alphabet": "GOOGL", "google": "GOOGL", "gamestop": "GME", "amc": "AMC",
}
# All-caps words that are not tickers.
_STOP = {
    "A", "I", "AN", "AND", "OR", "THE", "OF", "TO", "ON", "IN", "IS", "IT", "MY", "VS", "FOR", "AT", "WITH", "WHAT", "WHY",
    "HOW", "DO", "RSI", "SMA", "PE", "P", "E", "EPS", "ETF", "AI", "US", "USA", "USD", "CEO", "Q", "OK", "NEWS", "VIX", "SEC",
    "DOES", "DID", "HAS", "HAVE", "BE", "BEEN", "ARE", "WAS", "WERE", "CAN", "COULD", "WOULD", "ME", "TELL", "ABOUT",
    "SHOW", "PRICE", "TODAY", "MOVE", "MOVED", "DROP", "FELL", "JUMP", "PUMP", "DUMP", "HYPE", "RISK", "RISKY", "SAFE",
    "BELOW", "ABOVE", "ITS", "DAY", "WEEK", "MONTH", "YEAR", "WATCH", "OUT", "STOCK", "CASH", "PAPER", "BUY", "SELL",
}
_PERIODS = (("year", "1y"), ("6 month", "6mo"), ("six month", "6mo"), ("3 month", "3mo"), ("quarter", "3mo"),
            ("week", "1w"), ("today", "1d"), ("month", "1mo"))
_has = lambda ql, *words: any(w in ql for w in words)


def _tickers(question: str) -> list[str]:
    ql = question.lower()
    out = list(dict.fromkeys(t for name, t in _NAMES.items() if re.search(rf"\b{name}\b", ql)))
    for match in re.finditer(r"(?<!\w)(\$?)([A-Z]{1,5})\b", question):
        explicit, ticker = match.groups()
        if (explicit or (ticker not in _STOP and ticker.lower() not in _NAMES)) and ticker not in out:
            out.append(ticker)
    return out


def _period(ql: str) -> str:
    return next((p for word, p in _PERIODS if word in ql), "1y")


def _pct(x) -> str:
    return "n/a" if x is None else f"{x:+.2f}%"


def run(question: str) -> AgentResult:
    q = question.strip()
    ql = q.lower()
    tk = _tickers(q)
    calls: list[dict] = []

    def call(name: str, **args) -> dict:
        out = getattr(tools, name)(**args)
        calls.append({"name": name, "input": args, "output": out})
        return out

    pump = _has(ql, "pump", "dump", "manipulat", "coordinated", "hype", "squeeze")
    compare = _has(ql, "compare", " vs ", "versus")
    if _has(ql, "buy ", "sell ", "place an order", "place a trade", "short ") and not _has(ql, "should", "paper account"):
        answer = "I cannot place orders or trade: I only read data. Use the BUY and SELL commands in the paper-trading panel for simulated orders."
    elif _has(ql, "paper") and _has(ql, "account", "position", "order", "cash", "p&l", "pnl", "holding", "trade"):
        out = call("get_paper_orders") if "order" in ql else call("get_paper_account")
        answer = _paper(out)
    elif len(tk) > 1 and not compare:
        answer = f"Which ticker do you mean: {', '.join(tk)}? Ask to compare them for a side-by-side view."
    elif compare and len(tk) >= 2:
        answer = _compare(call("compare_stocks", tickers=tk[:3]))
    elif _has(ql, "sentiment", "bluesky") and tk:
        answer = _sentiment(call("get_sentiment", ticker=tk[0]))
    elif pump and tk:
        answer = _pump(call("get_pump_risk", ticker=tk[0]))
    elif tk and _has(ql, "200-day", "moving average", "rsi", "52-week", "52 week", "technical"):
        answer = _technicals(call("get_technical_indicators", ticker=tk[0]))
    elif tk and _has(ql, "risky", "volatil", "beta", "safe"):
        answer = _risk(call("explain_stock_risk", ticker=tk[0]))
    elif tk and (_has(ql, "why") or _has(ql, "what happened", "drop", "fell", "jump", "surge", "plunge", "moved")):
        answer = _move(call("explain_price_move", ticker=tk[0], period=_period(ql) if _period(ql) != "1y" else "1d"))
    elif tk and _has(ql, "news", "headline"):
        answer = _news(call("get_ticker_news", ticker=tk[0], limit=5))
    elif tk and _has(ql, "how has", "how did", "performance", "performed", "return", "done"):
        answer = _perf(call("get_price_performance", ticker=tk[0], period=_period(ql)))
    elif not tk or _has(ql, "what does", "watch out for", "business model", "company research"):
        answer = _knowledge(call("search_knowledge", query=q, ticker=tk[0] if tk else "", k=3))
    else:
        answer = _snapshot(call("get_stock_snapshot", ticker=tk[0]))
    return AgentResult(answer=answer, tool_calls=calls)


def _err(out: dict) -> str | None:
    return f"I could not get that: {out['error']}." if "error" in out else None


def _snapshot(o: dict) -> str:
    return _err(o) or (f"{o['name']} ({o['ticker']}) is in the {o['sector']} sector. It last traded at ${o['price']:.2f}, "
                       f"{_pct(o['changePct'])} on the day. [{o['dataMode']} data]")


def _perf(o: dict) -> str:
    return _err(o) or f"{o['ticker']} returned {_pct(o['return_pct'])} over {o['period']} and moves in a {o['movement']} way. [{o['dataMode']} data]"


def _compare(o: dict) -> str:
    if (e := _err(o)):
        return e
    lines = [f"- {r['ticker']}: ${r['price']:.2f}, {_pct(r['changePct'])} today, volatility {r['volatilityPct']}%, beta {r['beta']}"
             if "error" not in r else f"- {r['ticker']}: no data" for r in o["stocks"]]
    return "Side by side:\n" + "\n".join(lines)


def _risk(o: dict) -> str:
    return _err(o) or (f"{o['ticker']} has annualized volatility of {o['volatilityPct']}%, so it moves in a {o['movement']} way. "
                       f"Its beta is {o['beta']}, which is {o['sensitivity']}.")


def _technicals(o: dict) -> str:
    return _err(o) or (f"{o['ticker']} is ${o['price']:.2f}. 50-day average {o['sma50']}, 200-day average {o['sma200']} "
                       f"(price is {o['trend']} it), RSI {o['rsi']}, 52-week range {o['low52w']} to {o['high52w']}.")


def _news(o: dict) -> str:
    if (e := _err(o)):
        return e
    arts = o["articles"]
    if not arts:
        return f"No recent headlines found for {o['ticker']}."
    return f"Recent headlines for {o['ticker']} (third-party text, not verified):\n" + "\n".join(f"- {a['title']} ({a['publisher'] or 'source unknown'})" for a in arts)


def _move(o: dict) -> str:
    if (e := _err(o)):
        return e
    heads = "; ".join(a["title"] for a in o["articles"][:3]) or "no headlines found"
    return (f"{o['ticker']} moved {_pct(o['move_pct'])} ({o['direction']}) over {o['period']}, {o['window_start']} to {o['window_end']}. "
            f"Recent headlines that may be related, not confirmed causes: {heads}.")


def _sentiment(o: dict) -> str:
    if (e := _err(o)):
        return e
    if not o["available"]:
        return f"{o['reason']} {o['note']}"
    return (f"{o['model']} classified {o['classified']} {o['ticker']} posts ({o['window']}): {o['positive']} positive, "
            f"{o['neutral']} neutral, {o['negative']} negative. {o['note']}")


def _pump(o: dict) -> str:
    if (e := _err(o)):
        return e
    if o["score"] is None:
        answer = f"Pumpwatch does not currently score {o['ticker']}."
    else:
        window = f" (window ending {o['window_end']})" if o.get("window_end") else ""
        answer = (f"Pumpwatch rules-v1 scores {o['ticker']} {o['score']:.0f} of 100: {o['verdict']}{window}. "
                  "Current signal breakdown unavailable; current catalyst evidence unavailable.")
    for flag in o.get("recent_flags", [])[:1]:
        why = ", ".join(f"{c['featureGroup']} ({c['delta']:+.0f})" for c in flag["top_contributors"]) or "no breakdown available"
        cat = flag.get("catalyst")
        catalyst = (f"possible catalyst: {', '.join(cat.get('items', [])) or 'details unavailable'}"
                    if cat and cat.get("found") else "no catalyst recorded")
        answer += f" Historical flag at {flag['raised_at']}, score {flag['score']:.0f} of 100: {why}; {catalyst}."
    return (f"{answer} This is a risk signal about possible coordinated hype, not a price prediction. [{o['data_mode']} data]\n"
            f"Sentiment context: {_sentiment(o['sentiment'])}")


def _knowledge(o: dict) -> str:
    if (e := _err(o)):
        return e
    rows = o["results"]
    if not rows:
        return "I could not find that in the knowledge library."
    top = rows[0]
    body = re.sub(r"\s+", " ", re.sub(r"(?m)^#+\s*", "", top["text"])).strip()
    return f"{body[:600]} [{top['source']}]" + "".join(f" [{r['source']}]" for r in rows[1:3] if r["source"] != top["source"])


def _paper(o: dict) -> str:
    if (e := _err(o)):
        return e
    if "orders" in o:
        rows = o["orders"][:5]
        return "Your recent simulated orders:\n" + ("\n".join(f"- {r['side']} {r['qty']} {r['ticker']} at ${r['priceCents'] / 100:.2f}" for r in rows) or "none yet") + "\nSimulated only; I cannot place orders."
    if not o.get("valuation_available", True):
        return (f"Your simulated account holds ${o['cashCents'] / 100:,.2f} cash and {len(o['positions'])} position(s). "
                "Current holding prices, portfolio value and unrealized P&L are unavailable. Simulated only; I cannot place orders.")
    return (f"Your simulated account holds ${o['cashCents'] / 100:,.2f} cash and {len(o['positions'])} position(s), "
            f"total ${o['totalCents'] / 100:,.2f}, P&L ${o['pnlCents'] / 100:+,.2f}. Simulated only; I cannot place orders.")
