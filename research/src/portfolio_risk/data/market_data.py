"""Market data access: deterministic mock by default, live yfinance opt-in.

The default (``USE_MOCK_DATA=1``) returns synthetic prices and never touches the
network — ideal for offline runs, tests, and reproducible evals. Set
``USE_MOCK_DATA=0`` to pull real adjusted-close data from yfinance, cached to
parquet so repeat calls are offline.

Logs go to stderr.
"""

from __future__ import annotations

import json
import logging
import math
import sys
import time

import pandas as pd
from yfinance.exceptions import YFException

from .. import cache, config
from . import mock_data

log = logging.getLogger("portfolio_risk.market_data")
if not log.handlers:  # stderr only
    _h = logging.StreamHandler(stream=sys.stderr)
    _h.setFormatter(logging.Formatter("%(name)s %(levelname)s: %(message)s"))
    log.addHandler(_h)
    log.setLevel(logging.INFO)


# What a flaky data source or a bad cache file can raise; anything else is a bug and should surface.
SOFT_ERRORS = (OSError, ValueError, KeyError, TypeError, AttributeError, RuntimeError, ImportError, YFException)


class DataUnavailableError(RuntimeError):
    pass


# How stale cached data may be before we refetch. Prices must stay current, so a
# few calendar days (covers weekends/holidays); company info changes slowly.
_MAX_PRICE_AGE_DAYS = 4
_MAX_INFO_AGE_DAYS = 2


def _days_old(when) -> float:
    """Calendar days between ``when`` and today (local)."""
    try:
        last = pd.Timestamp(when).normalize()
        return (pd.Timestamp.now().normalize() - last).days
    except SOFT_ERRORS:
        return float("inf")


def _cache_path(ticker: str):
    return config.PRICE_CACHE_DIR / f"{ticker.upper()}.parquet"


def _read_cache(ticker: str) -> pd.Series | None:
    path = _cache_path(ticker)
    if not path.exists():
        return None
    try:
        df = pd.read_parquet(path)
        series = df["adj_close"]
        series.attrs.update(df.attrs)
        return series
    except SOFT_ERRORS as exc:
        log.warning("Failed to read cache for %s: %s", ticker, exc)
        return None


def _write_cache(ticker: str, series: pd.Series, lookback_days: int) -> None:
    config.ensure_dirs()
    df = pd.DataFrame({"adj_close": series})
    df.attrs["lookback_days"] = lookback_days
    df.to_parquet(_cache_path(ticker))


def _download_yf(tickers: list[str], period_days: int) -> pd.DataFrame:
    """Fetch a trading-day lookback from yfinance with retry/backoff. stderr-only logs."""
    import yfinance as yf  # imported lazily so mock mode needs no yfinance

    # Very large lookbacks mean "all available history" — yfinance only accepts
    # the literal "max" for that, not an arbitrary day count.
    # Provider periods are calendar days; cover weekends/holidays plus a small buffer.
    calendar_days = math.ceil(period_days * 365.25 / config.TRADING_DAYS) + 14
    period = "max" if period_days >= 3000 else f"{max(calendar_days, 30)}d"
    last_exc: Exception | None = None
    for attempt in range(3):
        try:
            raw = yf.download(
                tickers,
                period=period,
                auto_adjust=True,
                progress=False,
                threads=False,
            )
            if raw is None or raw.empty:
                raise DataUnavailableError("yfinance returned an empty frame")
            # Normalize single- vs multi-ticker column shapes to a flat frame.
            if isinstance(raw.columns, pd.MultiIndex):
                close = raw["Close"]
            else:
                close = raw[["Close"]].rename(columns={"Close": tickers[0]})
            return close.dropna(how="all")
        except SOFT_ERRORS as exc:
            last_exc = exc
            log.warning("yfinance attempt %d failed: %s", attempt + 1, exc)
            time.sleep(1.5 * (attempt + 1))
    raise DataUnavailableError(f"yfinance failed after retries: {last_exc}")


def get_prices(
    tickers: list[str],
    lookback_days: int = config.DEFAULT_LOOKBACK_DAYS,
    force_refresh: bool = False,
) -> pd.DataFrame:
    """Adjusted-close matrix (index=dates, cols=tickers).

    Mock mode returns synthetic prices. Live mode reads the parquet cache and
    hits yfinance only for tickers missing from cache (or when force_refresh).
    """
    tickers = [t.upper() for t in tickers]
    if not tickers:
        raise DataUnavailableError("No tickers requested.")

    if config.use_mock_data():
        # Cap synthetic history so an "all time" request doesn't generate decades.
        return mock_data.generate_prices(tickers, days=min(lookback_days, 3024))

    # Live path with caching.
    cached: dict[str, pd.Series] = {}
    missing: list[str] = []
    for t in tickers:
        series = None if force_refresh else _read_cache(t)
        fresh = (
            series is not None
            and (len(series) >= lookback_days or series.attrs.get("lookback_days", 0) >= lookback_days)
            and _days_old(series.index.max()) <= _MAX_PRICE_AGE_DAYS
        )
        if fresh:
            cached[t] = series
        else:
            missing.append(t)

    if missing:
        fetched = _download_yf(missing, lookback_days)
        for t in missing:
            if t in fetched.columns:
                s = fetched[t].dropna()
                cached[t] = s
                _write_cache(t, s, lookback_days)
            else:
                log.warning("No data returned for %s; dropping.", t)

    usable = {t: cached[t] for t in tickers if t in cached}
    if not usable:
        raise DataUnavailableError(f"No usable price data for {tickers}.")
    df = pd.DataFrame(usable).sort_index()
    return df.tail(lookback_days)






# Shared quote cache so repeated reads of the same ticker within a few seconds
# (e.g. snapshot + technicals on one page load) hit the network once.
_QUOTE_TTL_SEC = 20.0


def get_quote(ticker: str) -> dict | None:
    """Live near-real-time quote from yfinance ``fast_info``.

    Returns ``{"price", "previous_close", "change_pct"}`` (today's move vs the
    previous close), or ``None`` in mock mode or if the lookup fails — callers
    then fall back to the last cached daily close. Memoized in-process.
    """
    if config.use_mock_data():
        return None
    t = ticker.upper()
    key = f"q:v1:{t}"
    cached = cache.cache_get_json(key)
    if cached is not None:
        return cached
    result: dict | None = None
    try:
        import yfinance as yf

        fi = yf.Ticker(t).fast_info

        def pick(*keys):
            for k in keys:
                v = None
                if hasattr(fi, "get"):
                    try:
                        v = fi.get(k)
                    except SOFT_ERRORS:
                        v = None
                if v is None:
                    v = getattr(fi, k, None)
                if v not in (None, 0):
                    return float(v)
            return None

        price = pick("lastPrice", "last_price")
        prev = pick("previousClose", "previous_close", "regularMarketPreviousClose")
        if price is not None:
            change = (price / prev - 1.0) if prev else 0.0
            result = {"price": price, "previous_close": prev, "change_pct": change}
    except SOFT_ERRORS as exc:
        log.warning("Live quote failed for %s: %s", t, exc)
        result = None
    if result is not None:
        cache.cache_set_json(key, result, _QUOTE_TTL_SEC)
    return result


# --------------------------------------------------------------------------- #
# Company info (name / sector / description / market cap / P/E)
# --------------------------------------------------------------------------- #
def _info_cache_path(ticker: str):
    return config.PRICE_CACHE_DIR / f"{ticker.upper()}.info.json"


def _read_info_cache(ticker: str) -> dict | None:
    path = _info_cache_path(ticker)
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except SOFT_ERRORS as exc:
        log.warning("Failed to read info cache for %s: %s", ticker, exc)
        return None


def _write_info_cache(ticker: str, info: dict) -> None:
    config.ensure_dirs()
    stamped = {**info, "_cached_at": pd.Timestamp.now().isoformat()}
    _info_cache_path(ticker).write_text(json.dumps(stamped), encoding="utf-8")


def _short_desc(text: str, limit: int = 280) -> str:
    """First couple of sentences of the business summary — the UI wants a
    blurb, not the 10-K intro. Cuts at a sentence boundary when possible."""
    if len(text) <= limit:
        return text
    cut = text[:limit]
    best = max(cut.rfind(". "), cut.rfind("! "), cut.rfind("? "))
    if best > 80:
        return cut[: best + 1]
    return cut.rsplit(" ", 1)[0] + "…"


def _opt_float(x):
    try:
        return float(x) if x is not None else None
    except (TypeError, ValueError):
        return None


def _download_info_yf(ticker: str) -> dict:
    """Fetch company info from yfinance ``.info``. Every field is guarded with
    .get because the endpoint is frequently partial. stderr-only logs."""
    import yfinance as yf  # imported lazily so mock mode needs no yfinance

    raw = yf.Ticker(ticker).info or {}
    description = _short_desc((raw.get("longBusinessSummary") or "").strip())
    # Current yfinance reports dividendYield in PERCENT (AAPL ~0.37 == 0.37%).
    # Convert to a fraction; refuse implausible values rather than display them.
    dy = _opt_float(raw.get("dividendYield"))
    if dy is not None:
        dy = dy / 100.0
        if dy > 0.25:  # >25% yield — almost certainly a unit mix-up
            dy = None
    return {
        "ticker": ticker.upper(),
        "name": raw.get("shortName") or raw.get("longName") or ticker.upper(),
        "sector": raw.get("sector") or "Unknown",
        "industry": raw.get("industry") or None,
        "description": description or "No description available.",
        "website": raw.get("website") or None,
        "country": raw.get("country") or None,
        "employees": raw.get("fullTimeEmployees"),
        "market_cap": raw.get("marketCap"),
        "pe_ratio": raw.get("trailingPE"),
        "forward_pe": _opt_float(raw.get("forwardPE")),
        "dividend_yield": dy,
        "profit_margin": _opt_float(raw.get("profitMargins")),
        "revenue_growth": _opt_float(raw.get("revenueGrowth")),
        "recommendation": raw.get("recommendationKey") or None,
        "analyst_target": _opt_float(raw.get("targetMeanPrice")),
        "analyst_count": raw.get("numberOfAnalystOpinions"),
    }


def _info_is_empty(info: dict, ticker: str) -> bool:
    """True when a live lookup returned essentially nothing — a profile that's
    just the ticker echoed back. Caching that would pin the failure for days."""
    return (
        info.get("name") in (None, "", ticker.upper())
        and info.get("market_cap") is None
        and info.get("description") in ("", "No description available.")
    )


def get_company_info(
    tickers: list[str], force_refresh: bool = False
) -> dict[str, dict]:
    """Map each ticker to ``{ticker, name, sector, description, market_cap, pe_ratio}``.

    Mock mode returns deterministic synthetic profiles. Live mode reads a JSON
    cache and hits yfinance only for tickers missing from cache (or on
    force_refresh). Failed live lookups return unavailable metadata without
    caching it, so the next request can retry.
    """
    tickers = [t.upper() for t in tickers]
    if not tickers:
        raise DataUnavailableError("No tickers requested.")

    if config.use_mock_data():
        return {t: mock_data.generate_company_info(t) for t in tickers}

    out: dict[str, dict] = {}
    for t in tickers:
        rkey = f"info:v3:{t}"
        if not force_refresh:
            hit = cache.cache_get_json(rkey)
            if hit is not None:
                out[t] = hit
                continue
        info = None if force_refresh else _read_info_cache(t)
        if info is not None and _days_old(info.get("_cached_at")) > _MAX_INFO_AGE_DAYS:
            info = None  # cache too old — refetch
        if info is not None and "industry" not in info:
            info = None  # pre-enrichment cache format — refetch for new fields
        if info is not None and (info.get("dividend_yield") or 0) > 0.25:
            info = None  # cached with the old percent/fraction mix-up — refetch
        if info is not None and len(info.get("description") or "") > 320:
            info = None  # cached long-form description — refetch the blurb
        if info is None:
            try:
                info = _download_info_yf(t)
                if _info_is_empty(info, t):
                    # Don't cache a transient yfinance hiccup for 2 days.
                    raise DataUnavailableError("yfinance returned an empty profile")
                _write_info_cache(t, info)
            except SOFT_ERRORS as exc:
                log.warning("Live info lookup failed for %s: %s; metadata unavailable.", t, exc)
                out[t] = {"ticker": t, "name": t, "sector": "Unknown", "description": "No description available.",
                          "market_cap": None, "pe_ratio": None}
                continue
        clean = {k: v for k, v in info.items() if k != "_cached_at"}
        cache.cache_set_json(rkey, clean, _MAX_INFO_AGE_DAYS * 86400)
        out[t] = clean
    return out


# --- News. Headlines are untrusted text: tools hand them to the model as data, never as instructions. ---
_NEWS_TTL_SEC = 300.0


def _parse_news_item(item: dict) -> dict | None:
    """Normalize a yfinance news item (the nested schema, or the older flat one)."""
    content = item.get("content") if isinstance(item, dict) else None
    c = content if isinstance(content, dict) else item
    title = c.get("title")
    if not title:
        return None
    url = (c.get("canonicalUrl") or {}).get("url") or (c.get("clickThroughUrl") or {}).get("url") or c.get("link") or ""
    return {
        "title": str(title)[:200],
        "publisher": str((c.get("provider") or {}).get("displayName") or c.get("publisher") or "")[:80],
        "url": url if str(url).startswith(("http://", "https://")) else "",
        "published": str(c.get("pubDate") or c.get("displayTime") or ""),
        "summary": str(c.get("summary") or c.get("description") or "")[:300],
    }


def get_news(ticker: str, limit: int = 6) -> list[dict]:
    """Recent headlines for a ticker. Mock mode returns synthetic ones; live mode reads yfinance (cached 5 minutes)."""
    t = ticker.upper()
    if config.use_mock_data():
        return mock_data.generate_news(t, limit)
    key = f"news:{t}"
    cached = cache.cache_get_json(key)
    if cached is None:
        try:
            import yfinance as yf

            cached = [p for p in (_parse_news_item(it) for it in (yf.Ticker(t).news or [])) if p]
        except SOFT_ERRORS as exc:
            log.warning("News lookup failed for %s: %s", t, exc)
            return []
        cache.cache_set_json(key, cached, _NEWS_TTL_SEC)
    return cached[:limit]
