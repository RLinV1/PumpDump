from __future__ import annotations

import pandas as pd
import pytest

from portfolio_risk.data import returns as ret


def test_simple_returns():
    prices = pd.DataFrame({"X": [100.0, 110.0, 99.0]})
    r = ret.to_returns(prices)
    assert r["X"].tolist() == pytest.approx([0.1, -0.1])


def test_align_inner_join():
    idx = pd.bdate_range("2022-01-03", periods=5)
    df = pd.DataFrame({"A": range(5)}, index=idx).astype(float)
    bench = pd.Series(range(3), index=idx[:3]).astype(float)
    aligned_df, aligned_bench = ret.align(df, bench)
    assert len(aligned_df) == 3
    assert len(aligned_bench) == 3
    assert "A" in aligned_df.columns
