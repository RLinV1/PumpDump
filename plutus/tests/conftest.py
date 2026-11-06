"""Shared fixtures. Forces fully offline, deterministic mode for all tests."""

from __future__ import annotations

import os

import numpy as np
import pandas as pd
import pytest

os.environ["USE_MOCK_DATA"] = "1"


@pytest.fixture
def db(tmp_path):
    """A fresh paper-trading SQLite file for one test."""
    return tmp_path / "paper.db"


@pytest.fixture
def returns_series():
    rng = np.random.default_rng(7)
    return pd.Series(rng.normal(0.0005, 0.012, size=300), index=pd.bdate_range("2022-01-03", periods=300))


@pytest.fixture
def benchmark_series():
    rng = np.random.default_rng(99)
    return pd.Series(rng.normal(0.0003, 0.010, size=300), index=pd.bdate_range("2022-01-03", periods=300))
