"""Query the knowledge library. Retrieved text is untrusted data: callers must never treat it as instructions."""

from __future__ import annotations

from .store import collection_exists, get_collection


def search_knowledge(query: str, ticker: str | None = None, k: int = 4) -> list[dict]:
    """Up to ``k`` chunks, each ``{text, ticker, source, score}`` (higher score = closer). Empty when the store is not built."""
    if not query.strip() or not collection_exists():
        return []
    res = get_collection().query(query_texts=[query], n_results=k, where={"ticker": ticker.upper()} if ticker else None)
    docs, metas, dists = ((res.get(key) or [[]])[0] for key in ("documents", "metadatas", "distances"))
    return [
        {"text": doc, "ticker": (meta or {}).get("ticker", ""), "source": (meta or {}).get("source", ""), "score": round(1.0 - float(dist), 4)}
        for doc, meta, dist in zip(docs, metas, dists, strict=True)
    ]
