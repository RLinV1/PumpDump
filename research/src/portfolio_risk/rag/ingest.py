"""Build the knowledge library: split each seed Markdown file by heading and embed the sections into Chroma.

Run:  python -m portfolio_risk.rag.ingest               # rebuild
      python -m portfolio_risk.rag.ingest --if-missing  # only when the store is not there yet
The Docker image runs this at build time. Legacy collections without completion metadata rebuild once.
Completed versions remain available for readers during a rebuild.
"""

from __future__ import annotations

import argparse
import contextlib
import os
import re
import sys
import uuid

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
    name = f"{config.COLLECTION_NAME}_{uuid.uuid4().hex}"
    collection = get_collection(create=True, name=name)
    pointer = config.RAG_DIR / f".active_collection_{uuid.uuid4().hex}"
    try:
        total = 0
        for path in sorted(config.SEED_DIR.glob("*.md")):
            chunks = sections(path.read_text(encoding="utf-8"))
            collection.upsert(
                ids=[f"{path.stem}::{i}" for i in range(len(chunks))], documents=chunks,
                metadatas=[{"ticker": ticker_of(path.name), "source": path.name, "chunk": i} for i in range(len(chunks))],
            )
            total += len(chunks)
        if not total or collection.count() != total:
            raise RuntimeError("knowledge library build is incomplete")
        collection.modify(metadata={"complete": True, "chunks": total})
        config.RAG_DIR.mkdir(parents=True, exist_ok=True)
        pointer.write_text(name, encoding="utf-8")
        # Keep the previous collection alive for readers holding its handle.
        os.replace(pointer, config.RAG_DIR / "active_collection")
    except Exception:
        with contextlib.suppress(Exception):
            get_client().delete_collection(name)
        raise
    finally:
        pointer.unlink(missing_ok=True)
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
