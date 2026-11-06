"""Knowledge library: build into a temp store, then retrieve. Uses Chroma's default ONNX embedder (downloads once, no key)."""

from __future__ import annotations

import pytest

from portfolio_risk import config, tools
from portfolio_risk.rag import ingest, search


@pytest.fixture(scope="module")
def store(tmp_path_factory):
    path = tmp_path_factory.mktemp("rag")
    old = config.RAG_DIR
    config.RAG_DIR = path
    try:
        assert ingest.ingest_seed() > 10
        yield path
    finally:
        config.RAG_DIR = old


def test_sections_keep_the_title():
    parts = ingest.sections("# Title\n\nintro\n\n## One\na\n\n## Two\nb\n")
    assert len(parts) == 3 and all(p.startswith("# Title") for p in parts)
    assert ingest.ticker_of("AAPL_profile.md") == "AAPL" and ingest.ticker_of("GENERAL_x.md") == "GENERAL"


def test_retrieval_finds_the_right_file(store):
    top = search.search_knowledge("what is a pump and dump scheme", k=3)
    assert top and top[0]["source"] == "GENERAL_pump_and_dump.md" and 0 < top[0]["score"] <= 1
    only = search.search_knowledge("what does the company do", ticker="NVDA", k=3)
    assert only and {r["ticker"] for r in only} == {"NVDA"}


def test_tool_wraps_the_store(store):
    out = tools.search_knowledge("how do I read the Pumpwatch risk score", k=2)
    assert out["results"][0]["source"] == "GENERAL_reading_pumpwatch.md"
    assert search.search_knowledge("   ") == []


def test_missing_store_returns_nothing_not_an_error(tmp_path):
    old = config.RAG_DIR
    config.RAG_DIR = tmp_path / "empty"
    try:
        assert tools.search_knowledge("anything") == {"results": []}
    finally:
        config.RAG_DIR = old
