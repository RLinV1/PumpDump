"""One-ticker stock lookup: snapshot, price performance, technical indicators, risk metrics.

Every number comes from the pure numpy/pandas code in ``risk/``. Nothing here is investment advice.
"""

from __future__ import annotations

import math

import pandas as pd

from . import config
from .data.loader import load_returns
from .data.market_data import get_company_info, get_prices, get_quote
from .risk import indicators, metrics

# Performance window name -> approximate number of trading days.
PERIODS: dict[str, int] = {"1d": 1, "1w": 5, "1mo": 21, "3mo": 63, "6mo": 126, "1y": 252}


def _movement(vol: float) -> str:
    if math.isnan(vol):
        return "unknown"
    if vol < 0.15:
        return "calm"
    return "average" if vol < 0.30 else "bumpy"


def _sensitivity(b: float) -> str:
    if math.isnan(b):
        return "unknown"
    if b < 0.8:
        return "less sensitive than the market"
    if b <= 1.2:
        return "about as sensitive as the market"
    return "more sensitive than the market" if b <= 1.5 else "much more sensitive than the market"


def _num(x, digits: int = 4):
    """Float rounded for JSON, NaN and None mapped to None."""
    if x is None:
        return None
    f = float(x)
    return None if math.isnan(f) else round(f, digits)


def _prices(ticker: str, lookback_days: int) -> pd.Series:
    df = get_prices([ticker], lookback_days=lookback_days)
    series = df[ticker].dropna() if ticker in df.columns else pd.Series(dtype=float)
    if series.empty:
        raise ValueError(f"No price data available for {ticker}.")
    return series


def _current(ticker: str, series: pd.Series) -> tuple[float, float]:
    """(price, today's change as a fraction): a live yfinance quote, else the last daily closes (mock mode)."""
    quote = get_quote(ticker)
    if quote and quote.get("price"):
        return float(quote["price"]), float(quote.get("change_pct", 0.0))
    last = float(series.iloc[-1])
    return last, float(series.iloc[-1] / series.iloc[-2] - 1.0) if len(series) >= 2 else 0.0


def mock_close(ticker: str) -> float:
    """The mock price a lookup shows, used by the lookup tests."""
    return float(_prices(ticker, 300).iloc[-1])


def lookup(ticker: str) -> dict:
    """Everything the LOOK panel shows for one ticker. Raises ValueError when there is no price data."""
    t = ticker.upper()
    info = get_company_info([t])[t]
    series = _prices(t, 300)
    price, change = _current(t, series)

    performance = {}
    for name, days in PERIODS.items():
        if len(series) > days:
            performance[name] = _num((series.iloc[-1] / series.iloc[-(days + 1)] - 1.0) * 100.0, 2)
        else:
            performance[name] = None

    sma_50, sma_200 = indicators.sma(series, 50), indicators.sma(series, 200)
    low, high, position = indicators.fifty_two_week_range(series)
    rsi = indicators.rsi(series, 14)

    vol = metrics.annualized_volatility(series.pct_change().dropna())
    returns, bench = load_returns([t], config.DEFAULT_BENCHMARK, config.DEFAULT_LOOKBACK_DAYS)
    b = metrics.beta(returns[t], bench)
    return {
        "ticker": t,
        "name": info.get("name", t),
        "sector": info.get("sector", "Unknown"),
        "price": round(price, 2),
        "changePct": round(change * 100.0, 2),
        "marketCap": _num(info.get("market_cap"), 0),
        "peRatio": _num(info.get("pe_ratio"), 2),
        "performance": performance,
        "indicators": {
            "sma50": _num(sma_50, 2), "sma200": _num(sma_200, 2), "rsi": _num(rsi, 1),
            "low52w": _num(low, 2), "high52w": _num(high, 2), "rangePosition": _num(position, 2),
            "trend": None if math.isnan(sma_200) else ("above" if price > sma_200 else "below"),
        },
        "risk": {
            "beta": _num(b, 2), "volatilityPct": _num(vol * 100.0, 2),
            "movement": _movement(vol), "sensitivity": _sensitivity(b), "benchmark": config.DEFAULT_BENCHMARK,
        },
        "dataMode": "mock" if config.use_mock_data() else "live",
    }
