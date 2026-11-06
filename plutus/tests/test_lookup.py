from __future__ import annotations

from portfolio_risk.lookup import lookup, mock_close


def test_lookup_has_every_section_and_is_labelled_mock():
    out = lookup("aapl")
    assert out["ticker"] == "AAPL" and out["dataMode"] == "mock"
    assert out["name"] == "Apple Inc." and out["sector"] == "Technology"
    assert set(out["performance"]) == {"1d", "1w", "1mo", "3mo", "6mo", "1y"}
    assert {"sma50", "sma200", "rsi", "low52w", "high52w"} <= set(out["indicators"])
    assert out["risk"]["beta"] is not None and out["risk"]["volatilityPct"] > 0


def test_lookup_price_is_the_mock_fill_price():
    assert lookup("MSFT")["price"] == round(mock_close("MSFT"), 2)


def test_lookup_is_deterministic():
    assert lookup("KO") == lookup("KO")
