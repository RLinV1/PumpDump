"""Central configuration: paths, constants, and mode switches.

No I/O at import time beyond resolving paths and reading environment variables.
"""

from __future__ import annotations

import os
from pathlib import Path

# --- Paths ---
PKG_ROOT = Path(__file__).resolve().parent              # .../src/portfolio_risk
PROJECT_ROOT = PKG_ROOT.parents[1]                      # research/
DATA_DIR = Path(os.environ.get("RESEARCH_DATA_DIR", "").strip() or PROJECT_ROOT / "data")
CACHE_DIR = DATA_DIR / "cache"
PRICE_CACHE_DIR = CACHE_DIR / "prices"
SEED_DIR = PKG_ROOT / "rag" / "seed"                    # the bundled knowledge library (plain Markdown)
RAG_DIR = Path(os.environ.get("RAG_DIR", "").strip() or DATA_DIR / "rag")  # Chroma store; the image builds it ahead of time
COLLECTION_NAME = "knowledge"

# --- Finance constants ---
TRADING_DAYS = 252
DEFAULT_BENCHMARK = "SPY"
DEFAULT_LOOKBACK_DAYS = 504  # ~2 years of trading days


def _flag(name: str, default: str) -> str:
    return os.environ.get(name, default).strip().lower()


def use_mock_data() -> bool:
    """``USE_MOCK_DATA=1`` (the default for the service image) means synthetic prices and no network.

    Unset or ``0`` pulls real data from yfinance for lookups.
    """
    return _flag("USE_MOCK_DATA", "0") not in ("0", "false", "no")


# --- Assistant ---
# Tried in order; the next one is used when a model is retired (404) or out of quota (429). IDs checked against models.list() 2026-11-12.
GEMINI_MODELS_DEFAULT = ("gemini-3.8-flash", "gemini-3.5-flash-lite", "gemini-3.6-flash")
MAX_TOOL_STEPS = 6           # model turns that may call tools before the loop is cut off
ASSISTANT_TIMEOUT_SEC = 40   # whole run; the web route allows 45


def gemini_models() -> list[str]:
    """Env GEMINI_MODEL first (if set), then the defaults, without duplicates."""
    return list(dict.fromkeys([m for m in (os.environ.get("GEMINI_MODEL", "").strip(),) if m] + list(GEMINI_MODELS_DEFAULT)))


def gemini_model() -> str:
    return gemini_models()[0]


def gemini_api_key() -> str:
    """Server-side only. Never logged, never returned to the browser."""
    return os.environ.get("GEMINI_API_KEY", "").strip()


def use_mock_llm() -> bool:
    """``USE_MOCK_LLM=auto`` (default) means the rule-based mock agent unless ``GEMINI_API_KEY`` is set."""
    mode = _flag("USE_MOCK_LLM", "auto")
    if mode in ("1", "true", "yes"):
        return True
    if mode in ("0", "false", "no"):
        return False
    return not gemini_api_key()


def pumpwatch_api_url() -> str | None:
    """Base URL of the Pumpwatch web server, which serves /api/v1/watchlist, /flags and the sentiment route
    (mock records in mock mode, the real API in live mode). None means the pump and sentiment tools say so."""
    return os.environ.get("PUMPWATCH_API_URL", "").strip().rstrip("/") or None


def ensure_dirs() -> None:
    for d in (DATA_DIR, CACHE_DIR, PRICE_CACHE_DIR):
        d.mkdir(parents=True, exist_ok=True)
