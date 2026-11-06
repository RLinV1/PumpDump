"""Pure risk metrics for a single stock: annualized volatility and beta.

Both take *returns* (not prices) and do no I/O, so they are deterministic and
unit-testable.
"""

from __future__ import annotations

import numpy as np

from ..config import TRADING_DAYS


def _as_1d(returns) -> np.ndarray:
    arr = np.asarray(returns, dtype=float).ravel()
    return arr[~np.isnan(arr)]


def annualized_volatility(returns, periods: int = TRADING_DAYS) -> float:
    """Annualized standard deviation of returns (sample std, ddof=1)."""
    r = _as_1d(returns)
    return float(np.std(r, ddof=1) * np.sqrt(periods))


def beta(asset_returns, benchmark_returns) -> float:
    """Beta of an asset vs a benchmark: cov(a, b) / var(b) (ddof=1, aligned)."""
    a = np.asarray(asset_returns, dtype=float).ravel()
    b = np.asarray(benchmark_returns, dtype=float).ravel()
    mask = ~(np.isnan(a) | np.isnan(b))
    a, b = a[mask], b[mask]
    if len(a) < 2:
        return float("nan")
    cov = np.cov(a, b, ddof=1)
    var_b = cov[1, 1]
    if var_b == 0:
        return float("nan")
    return float(cov[0, 1] / var_b)
