"""Price -> return transforms and alignment helpers."""

from __future__ import annotations

import pandas as pd


def to_returns(prices: pd.DataFrame) -> pd.DataFrame:
    """Simple daily returns from an adjusted-close price matrix. Drops the leading NaN row."""
    return prices.pct_change().dropna(how="all")


def align(
    returns_df: pd.DataFrame, benchmark: pd.Series
) -> tuple[pd.DataFrame, pd.Series]:
    """Inner-join asset returns and a benchmark series on common dates."""
    joined = returns_df.join(benchmark.rename("__benchmark__"), how="inner").dropna()
    bench = joined.pop("__benchmark__")
    return joined, bench
