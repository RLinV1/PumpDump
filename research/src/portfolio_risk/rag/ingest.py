"""Build the knowledge library: split each seed Markdown file by heading and embed the sections into Chroma.

Run:  python -m portfolio_risk.rag.ingest               # rebuild
      python -m portfolio_risk.rag.ingest --if-missing  # only when the store is not there yet
The Docker image runs this at build time.
"""

from __future__ import annotations

import argparse
import contextlib
import re
import sys

from .. import config
from .store import EMBEDDER, collection_exists, get_client, get_collection


def sections(text: str) -> list[str]:
    """Split on level-2 headings; each section keeps the document title so a chunk stands alone."""
    title, _, rest = text.partition("\n")
    parts = [p.strip() for p in re.split(r"(?m)^(?=## )", rest) if p.strip()]
    return [f"{title.strip()}\n{p}" for p in parts] or [text.strip()]


def ticker_of(name: str) -> str:
    m = re.match(r"([A-Z]+)_", name)
    return m.group(1) if m else "GENERAL"


def ingest_seed() -> int:
    with contextlib.suppress(Exception):  # first build: nothing to delete
        get_client().delete_collection(config.COLLECTION_NAME)
    collection = get_collection(create=True)
    total = 0
    for path in sorted(config.SEED_DIR.glob("*.md")):
        chunks = sections(path.read_text(encoding="utf-8"))
        collection.upsert(
            ids=[f"{path.stem}::{i}" for i in range(len(chunks))], documents=chunks,
            metadatas=[{"ticker": ticker_of(path.name), "source": path.name, "chunk": i} for i in range(len(chunks))],
        )
        total += len(chunks)
    return total


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the knowledge library.")
    parser.add_argument("--if-missing", action="store_true")
    args = parser.parse_args()
    if args.if_missing and collection_exists():
        print("knowledge library already built", file=sys.stderr)
        return
    print(f"{ingest_seed()} chunks embedded with {EMBEDDER} into {config.RAG_DIR}", file=sys.stderr)


if __name__ == "__main__":
    main()
