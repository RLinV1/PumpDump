"""Central configuration: paths, constants, and mode switches.

No I/O at import time beyond resolving paths and reading environment variables.
"""

from __future__ import annotations

import os
from pathlib import Path

# --- Paths ---
PKG_ROOT = Path(__file__).resolve().parent              # .../src/portfolio_risk
PROJECT_ROOT = PKG_ROOT.parents[1]                      # plutus/
DATA_DIR = Path(os.environ.get("PLUTUS_DATA_DIR", "").strip() or PROJECT_ROOT / "data")
CACHE_DIR = DATA_DIR / "cache"
PRICE_CACHE_DIR = CACHE_DIR / "prices"

# --- Finance constants ---
TRADING_DAYS = 252
DEFAULT_BENCHMARK = "SPY"
DEFAULT_LOOKBACK_DAYS = 504  # ~2 years of trading days


def _flag(name: str, default: str) -> str:
    return os.environ.get(name, default).strip().lower()


def use_mock_data() -> bool:
    """``USE_MOCK_DATA=1`` (the default for the service image) means synthetic prices and no network.

    Unset or ``0`` pulls real data from yfinance for lookups. Paper fills never use yfinance:
    in live mode the web server supplies an Alpaca quote.
    """
    return _flag("USE_MOCK_DATA", "0") not in ("0", "false", "no")


def paper_db_path() -> Path:
    """SQLite file holding the anonymous paper accounts (a named compose volume in Docker)."""
    return Path(os.environ.get("PAPER_DB", "").strip() or DATA_DIR / "paper.db")


def ensure_dirs() -> None:
    for d in (DATA_DIR, CACHE_DIR, PRICE_CACHE_DIR):
        d.mkdir(parents=True, exist_ok=True)
