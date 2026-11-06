"""Hand-computed checks for volatility, beta and the technical indicators."""

from __future__ import annotations

import numpy as np
import pytest

from portfolio_risk.risk import indicators, metrics


def test_volatility_fixed():
    r = np.array([0.01, -0.01, 0.01, -0.01])
    assert metrics.annualized_volatility(r, periods=1) == pytest.approx(np.std(r, ddof=1))


def test_beta_of_scaled_benchmark_is_the_scale(benchmark_series):
    assert metrics.beta(2.0 * benchmark_series, benchmark_series) == pytest.approx(2.0)


def test_beta_needs_two_points():
    assert np.isnan(metrics.beta([0.01], [0.02]))


def test_sma_and_short_history():
    assert indicators.sma([1, 2, 3, 4], 2) == 3.5
    assert np.isnan(indicators.sma([1, 2, 3], 5))


def test_rsi_all_gains_is_100():
    assert indicators.rsi(list(range(1, 40)), 14) == 100.0


def test_range_position():
    low, high, pos = indicators.fifty_two_week_range([10, 20, 15])
    assert (low, high, pos) == (10.0, 20.0, 0.5)
