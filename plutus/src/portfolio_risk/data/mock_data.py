"""Deterministic synthetic price data — the default, fully-offline data source.

Generates geometric-Brownian-motion adjusted-close series with per-ticker drift,
volatility, and a correlated market factor (so beta vs the benchmark is sensible).
Output is reproducible for a fixed seed, which keeps tests and evals stable.
"""

from __future__ import annotations

import hashlib

import numpy as np
import pandas as pd

# Per-ticker (annual_drift, annual_vol, beta_to_market). Unknown tickers get a
# deterministic profile derived from the ticker string.
_PROFILES: dict[str, tuple[float, float, float]] = {
    "SPY": (0.08, 0.16, 1.00),
    "AAPL": (0.18, 0.28, 1.15),
    "MSFT": (0.16, 0.26, 1.05),
    "NVDA": (0.30, 0.45, 1.55),
    "TSLA": (0.20, 0.55, 1.45),
    "JNJ": (0.06, 0.14, 0.60),
    "KO": (0.05, 0.13, 0.55),
    "AMZN": (0.17, 0.32, 1.20),
    "GOOGL": (0.15, 0.27, 1.05),
    "JPM": (0.10, 0.24, 1.10),
}


def _profile(ticker: str) -> tuple[float, float, float]:
    if ticker in _PROFILES:
        return _PROFILES[ticker]
    h = int(hashlib.sha256(ticker.encode()).hexdigest(), 16)
    drift = 0.04 + (h % 20) / 100.0          # 0.04 .. 0.23
    vol = 0.15 + ((h >> 8) % 35) / 100.0     # 0.15 .. 0.49
    beta = 0.6 + ((h >> 16) % 110) / 100.0   # 0.60 .. 1.69
    return drift, vol, beta


# Realistic names/sectors/blurbs for the demo tickers, so the offline experience
# looks believable. Unknown tickers fall back to a deterministic synthetic profile.
_KNOWN_INFO: dict[str, tuple[str, str, str]] = {
    "SPY": ("SPDR S&P 500 ETF Trust", "Index Fund",
            ("An exchange-traded fund that tracks the S&P 500 — a basket of 500 "
             "large U.S. companies, often used as a stand-in for 'the market'.")),
    "AAPL": ("Apple Inc.", "Technology",
             ("Designs and sells iPhones, Macs, iPads, wearables, and a growing "
              "set of services like the App Store, iCloud, and Apple Music.")),
    "MSFT": ("Microsoft Corporation", "Technology",
             ("Makes Windows and Office, runs the Azure cloud platform, owns "
              "LinkedIn and Xbox, and is a major investor in AI.")),
    "NVDA": ("NVIDIA Corporation", "Technology",
             ("Designs the graphics chips (GPUs) that power video games and, more "
              "importantly today, the data-center hardware behind modern AI.")),
    "TSLA": ("Tesla, Inc.", "Consumer Discretionary",
             ("Builds electric vehicles and battery/energy-storage products, and "
              "is working on self-driving software and robotics.")),
    "JNJ": ("Johnson & Johnson", "Healthcare",
            ("A large, diversified healthcare company spanning prescription "
             "medicines and medical devices.")),
    "KO": ("The Coca-Cola Company", "Consumer Staples",
           ("Sells soft drinks and other beverages worldwide — a classic example "
            "of a steady consumer-staples business.")),
    "AMZN": ("Amazon.com, Inc.", "Consumer Discretionary",
             ("Runs the world's largest online store and the AWS cloud platform, "
              "plus advertising, streaming, and devices.")),
    "GOOGL": ("Alphabet Inc.", "Technology",
              ("The parent company of Google Search, YouTube, Android, and the "
               "Google Cloud platform; most revenue comes from advertising.")),
    "JPM": ("JPMorgan Chase & Co.", "Financials",
            ("One of the largest U.S. banks, offering consumer banking, credit "
             "cards, investment banking, and asset management.")),
}

_SECTORS = [
    "Technology", "Healthcare", "Consumer Staples", "Financials",
    "Energy", "Industrials", "Consumer Discretionary", "Utilities",
]




_KNOWN_INDUSTRY: dict[str, str] = {
    "SPY": "Index Fund",
    "AAPL": "Consumer Electronics",
    "MSFT": "Software — Infrastructure",
    "NVDA": "Semiconductors",
    "TSLA": "Auto Manufacturers",
    "JNJ": "Drug Manufacturers",
    "KO": "Beverages — Non-Alcoholic",
    "AMZN": "Internet Retail",
    "GOOGL": "Internet Content & Information",
    "JPM": "Banks — Diversified",
}

_RECOMMENDATIONS = ["buy", "hold", "overweight", "underperform"]


def generate_company_info(ticker: str) -> dict:
    """Deterministic synthetic company profile (offline default).

    Mirrors the contract of the live ``market_data.get_company_info`` per-ticker
    value (incl. the enriched yfinance fields: industry, employees, dividend
    yield, margins, analyst view). Every field is derived purely from the ticker
    string (hash) or the known-ticker tables, so the same ticker always yields
    the same profile — which keeps tests/evals stable.
    """
    t = ticker.upper()
    h = int(hashlib.sha256(t.encode()).hexdigest(), 16)
    if t in _KNOWN_INFO:
        name, sector, description = _KNOWN_INFO[t]
    else:
        name = f"{t} Corporation"
        sector = _SECTORS[h % len(_SECTORS)]
        description = (
            f"{name} is a {sector.lower()} company. (This is a synthetic, "
            f"offline profile generated for demo and testing — not a real company.)"
        )
    market_cap = 5e9 + (h % 2950) * 1e9        # ~$5B .. ~$3T, deterministic
    pe_ratio = round(8.0 + (h >> 24) % 40, 1)  # 8.0 .. 47.x
    return {
        "ticker": t,
        "name": name,
        "sector": sector,
        "industry": _KNOWN_INDUSTRY.get(t, f"{sector} (synthetic)"),
        "description": description,
        "website": None,  # no fake URLs — the UI simply omits the link
        "country": "United States",
        "employees": int(1_000 + (h >> 4) % 200_000),
        "market_cap": float(market_cap),
        "pe_ratio": float(pe_ratio),
        "forward_pe": round(pe_ratio * 0.9, 1),
        "dividend_yield": round(((h >> 12) % 60) / 1000.0, 4),  # 0 .. 5.9%
        "profit_margin": round(0.05 + ((h >> 20) % 30) / 100.0, 4),
        "revenue_growth": round(-0.05 + ((h >> 28) % 40) / 100.0, 4),
        "recommendation": _RECOMMENDATIONS[h % len(_RECOMMENDATIONS)],
        "analyst_target": None,  # mock has no meaningful target price
        "analyst_count": int(5 + (h >> 8) % 40),
    }




def generate_prices(
    tickers: list[str],
    days: int = 504,
    seed: int = 42,
    start: str = "2021-01-04",
) -> pd.DataFrame:
    """Adjusted-close matrix (index=business days, cols=tickers).

    A shared market factor drives common variation; each ticker adds idiosyncratic
    noise scaled so its realized beta and volatility match its profile.
    """
    rng = np.random.default_rng(seed)
    dt = 1.0 / 252.0
    dates = pd.bdate_range(start=start, periods=days)

    # Shared market factor (excess daily returns around its own drift).
    _, m_vol, _ = _PROFILES["SPY"]
    market = rng.normal(0.0, m_vol * np.sqrt(dt), size=days)

    cols: dict[str, np.ndarray] = {}
    for t in tickers:
        drift, vol, b = _profile(t)
        # Decompose vol into market-driven and idiosyncratic parts.
        sys_vol = abs(b) * m_vol
        idio_var = max(vol**2 - sys_vol**2, (0.05 * vol) ** 2)
        idio = rng.normal(0.0, np.sqrt(idio_var) * np.sqrt(dt), size=days)
        daily = drift * dt + b * market + idio
        price = 100.0 * np.cumprod(1.0 + daily)
        cols[t] = price

    return pd.DataFrame(cols, index=dates)
