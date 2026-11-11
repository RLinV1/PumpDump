"""Live requests must cover trading-day windows even though provider periods are calendar days."""

import importlib
from unittest.mock import Mock

import pandas as pd
import pytest
import yfinance as yf

from portfolio_risk.data import market_data


@pytest.fixture
def live_prices(monkeypatch, tmp_path):
    monkeypatch.setenv("USE_MOCK_DATA", "0")
    monkeypatch.setattr(market_data.config, "PRICE_CACHE_DIR", tmp_path)
    monkeypatch.setattr(market_data.config, "ensure_dirs", lambda: None)
    calls = []

    def download(tickers, *, period, **kwargs):
        calls.append(period)
        end = pd.Timestamp.today().normalize()
        dates = pd.bdate_range(end - pd.Timedelta(days=int(period[:-1])), end)
        columns = pd.MultiIndex.from_product([["Close"], tickers])
        return pd.DataFrame({column: range(100, 100 + len(dates)) for column in columns}, index=dates)

    monkeypatch.setattr(yf, "download", download)
    return calls


def test_initial_live_lookup_has_one_year_performance(monkeypatch, live_prices):
    lookup = importlib.import_module("portfolio_risk.lookup")
    monkeypatch.setattr(lookup, "get_company_info", lambda tickers: {ticker: {} for ticker in tickers})
    monkeypatch.setattr(lookup, "get_quote", lambda ticker: None)
    result = lookup.lookup("AAPL")
    assert result["performance"]["1y"] is not None
    assert result["indicators"]["sma200"] is not None


def test_live_prices_tail_and_fresh_cache_are_preserved(live_prices):
    first = market_data.get_prices(["AAPL"], 300)
    assert len(first) == 300
    second = market_data.get_prices(["AAPL"], 300)
    pd.testing.assert_frame_equal(first, second, check_freq=False)
    assert len(live_prices) == 1


def test_short_ipo_history_does_not_retry_to_fill_window(monkeypatch, live_prices):
    dates = pd.bdate_range(end=pd.Timestamp.today().normalize(), periods=20)
    provider = Mock(return_value=pd.DataFrame({"Close": range(100, 120)}, index=dates))
    monkeypatch.setattr(yf, "download", provider)
    assert len(market_data.get_prices(["NEW"], 300)) == 20
    assert len(market_data.get_prices(["NEW"], 300)) == 20
    provider.assert_called_once()


def test_requested_window_survives_actual_parquet_roundtrip(live_prices):
    dates = pd.bdate_range(end=pd.Timestamp.today().normalize(), periods=20)
    market_data._write_cache("NEW", pd.Series(range(20), index=dates), 300)
    restored = market_data._read_cache("NEW")
    assert len(restored) == 20
    assert restored.attrs["lookback_days"] == 300


def test_legacy_short_cache_refetches_once(live_prices):
    dates = pd.bdate_range(end=pd.Timestamp.today().normalize(), periods=220)
    pd.DataFrame({"adj_close": range(220)}, index=dates).to_parquet(market_data._cache_path("AAPL"))
    assert len(market_data.get_prices(["AAPL"], 300)) == 300
    assert len(market_data.get_prices(["AAPL"], 300)) == 300
    assert len(live_prices) == 1


def test_full_legacy_cache_does_not_refetch(live_prices):
    dates = pd.bdate_range(end=pd.Timestamp.today().normalize(), periods=300)
    pd.DataFrame({"adj_close": range(300)}, index=dates).to_parquet(market_data._cache_path("AAPL"))
    assert len(market_data.get_prices(["AAPL"], 300)) == 300
    assert live_prices == []


def test_larger_requested_window_refetches_shorter_cache(live_prices):
    assert len(market_data.get_prices(["AAPL"], 300)) == 300
    assert len(market_data.get_prices(["AAPL"], 504)) == 504
    assert len(live_prices) == 2


def test_very_large_history_keeps_max_provider_request(monkeypatch, live_prices):
    dates = pd.bdate_range(end=pd.Timestamp.today().normalize(), periods=30)
    provider = Mock(return_value=pd.DataFrame({"Close": range(100, 130)}, index=dates))
    monkeypatch.setattr(yf, "download", provider)
    market_data.get_prices(["AAPL"], 3000)
    assert provider.call_args.kwargs["period"] == "max"
