from __future__ import annotations

import pytest

from portfolio_risk.data.market_data import _price_is_fresh

# 2026-11-09 is a Monday. Times are UTC; 17:00 UTC is noon Eastern.
CASES = [
    ("2026-11-09", "2026-11-12T17:00Z", False),  # Mon cache on Thu
    ("2026-11-11", "2026-11-12T17:00Z", True),   # Wed bar on Thu (previous weekday)
    ("2026-11-13", "2026-11-14T17:00Z", True),   # Fri bar on Sat
    ("2026-11-13", "2026-11-15T17:00Z", True),   # Fri bar on Sun
    ("2026-11-13", "2026-11-16T14:00Z", True),   # Fri bar on Mon before close
    ("2026-11-12", "2026-11-14T17:00Z", False),  # Thu bar on Sat
    ("2026-11-12", "2026-11-16T14:00Z", False),  # Thu bar on Mon
    ("2026-11-13", "2026-11-17T14:00Z", False),  # Fri bar on Tue
]


@pytest.mark.parametrize("last_bar,now,fresh", CASES)
def test_price_freshness(last_bar, now, fresh):
    assert _price_is_fresh(last_bar, now) is fresh
