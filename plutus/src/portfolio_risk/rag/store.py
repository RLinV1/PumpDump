"""Chroma persistent vector store with Chroma's default local embedder.

The embedder is Chroma's bundled ONNX build of all-MiniLM-L6-v2 (about 80 MB, run by onnxruntime, no torch). It needs no
API key. It downloads once into ``~/.cache/chroma``; the Docker image does that at build time, so start-up is fast and
offline. Telemetry is off, and nothing here writes to stdout (the MCP server speaks JSON-RPC there).
"""

from __future__ import annotations

import os

from .. import config

os.environ.setdefault("ANONYMIZED_TELEMETRY", "False")
os.environ.setdefault("CHROMA_TELEMETRY_ENABLED", "False")

EMBEDDER = "Chroma default ONNX all-MiniLM-L6-v2"


def get_client():
    import chromadb
    from chromadb.config import Settings

    config.RAG_DIR.mkdir(parents=True, exist_ok=True)
    return chromadb.PersistentClient(path=str(config.RAG_DIR), settings=Settings(anonymized_telemetry=False))


def collection_exists() -> bool:
    try:
        return any(getattr(c, "name", c) == config.COLLECTION_NAME for c in get_client().list_collections())
    except Exception:  # noqa: BLE001  (a missing or unreadable store means "not built yet")
        return False


def get_collection(create: bool = False):
    from chromadb.utils.embedding_functions import DefaultEmbeddingFunction

    client, ef = get_client(), DefaultEmbeddingFunction()
    if create:
        return client.get_or_create_collection(name=config.COLLECTION_NAME, embedding_function=ef, metadata={"hnsw:space": "cosine"})
    return client.get_collection(name=config.COLLECTION_NAME, embedding_function=ef)
