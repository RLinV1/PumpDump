"""Live metadata failures must not invent company fundamentals or pin a failed lookup."""

from unittest.mock import Mock

import pytest

from portfolio_risk import cache
from portfolio_risk.data import market_data, mock_data


@pytest.mark.parametrize("payload", [None, {}, {"symbol": "AAPL"}])
def test_failed_live_metadata_is_unavailable_and_retries(monkeypatch, payload):
    monkeypatch.setenv("USE_MOCK_DATA", "0")
    monkeypatch.setattr(cache, "_local", {})
    monkeypatch.setattr(market_data, "_read_info_cache", lambda ticker: None)
    write = Mock()
    monkeypatch.setattr(market_data, "_write_info_cache", write)
    import yfinance as yf

    provider = Mock()
    provider.info = payload
    ticker = Mock(return_value=provider)
    if payload is None:
        ticker.side_effect = ValueError("provider unavailable")
    monkeypatch.setattr(yf, "Ticker", ticker)

    unavailable = market_data.get_company_info(["AAPL"])["AAPL"]
    assert unavailable["market_cap"] is None
    assert unavailable["pe_ratio"] is None
    assert cache.cache_get_json("info:v3:AAPL") is None
    write.assert_not_called()

    ticker.side_effect = None
    provider.info = {"shortName": "Apple Inc.", "marketCap": 123.0, "trailingPE": 23.0}
    recovered = market_data.get_company_info(["AAPL"])["AAPL"]
    assert recovered["market_cap"] == 123.0
    assert recovered["pe_ratio"] == 23.0
    assert ticker.call_count == 2
    write.assert_called_once()


def test_mock_metadata_stays_synthetic(monkeypatch):
    monkeypatch.setenv("USE_MOCK_DATA", "1")
    assert market_data.get_company_info(["AAPL"])["AAPL"] == mock_data.generate_company_info("AAPL")


def test_live_metadata_ignores_old_synthetic_cache(monkeypatch):
    monkeypatch.setenv("USE_MOCK_DATA", "0")
    monkeypatch.setattr(cache, "_local", {})
    cache.cache_set_json("info:v2:AAPL", mock_data.generate_company_info("AAPL"), 86400)
    monkeypatch.setattr(market_data, "_read_info_cache", lambda ticker: None)
    monkeypatch.setattr(market_data, "_write_info_cache", Mock())
    provider = Mock(return_value={"name": "Apple Inc.", "market_cap": 123.0})
    monkeypatch.setattr(market_data, "_download_info_yf", provider)
    assert market_data.get_company_info(["AAPL"])["AAPL"]["market_cap"] == 123.0
    provider.assert_called_once_with("AAPL")


def test_valid_live_disk_metadata_is_preserved(monkeypatch):
    monkeypatch.setenv("USE_MOCK_DATA", "0")
    monkeypatch.setattr(cache, "_local", {})
    real = {"name": "Apple Inc.", "market_cap": 123.0, "industry": "Electronics", "_cached_at": "fresh"}
    monkeypatch.setattr(market_data, "_read_info_cache", lambda ticker: real)
    monkeypatch.setattr(market_data, "_days_old", lambda stamp: 0)
    provider = Mock(side_effect=AssertionError("valid disk metadata should not refetch"))
    monkeypatch.setattr(market_data, "_download_info_yf", provider)
    assert market_data.get_company_info(["AAPL"])["AAPL"] == {k: v for k, v in real.items() if k != "_cached_at"}
    provider.assert_not_called()
