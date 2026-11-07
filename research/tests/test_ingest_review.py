import sys

import pytest

from portfolio_risk import config
from portfolio_risk.rag import ingest, store


class Collection:
    def __init__(self, name, metadata=None):
        self.name, self.metadata, self.docs = name, metadata or {}, {}
        self.fail = False

    def upsert(self, ids, documents, metadatas):
        if self.fail:
            raise RuntimeError("embedding failed")
        self.docs.update(zip(ids, documents, strict=True))

    def count(self):
        return len(self.docs)

    def modify(self, metadata):
        self.metadata = metadata


class Client:
    def __init__(self):
        self.collections = {}
        self.fail_new = False

    def list_collections(self):
        return list(self.collections.values())

    def get_or_create_collection(self, name, metadata=None, **kwargs):
        if name not in self.collections:
            c = self.collections[name] = Collection(name, metadata)
            c.fail = self.fail_new
        return self.collections[name]

    create_collection = get_or_create_collection

    def get_collection(self, name, **kwargs):
        return self.collections[name]

    def delete_collection(self, name):
        del self.collections[name]


@pytest.fixture
def library(tmp_path, monkeypatch):
    seed = tmp_path / "seed"
    seed.mkdir()
    (seed / "GENERAL_test.md").write_text("# Title\n## First\ntext", encoding="utf-8")
    monkeypatch.setattr(config, "SEED_DIR", seed)
    monkeypatch.setattr(config, "RAG_DIR", tmp_path)
    client = Client()
    monkeypatch.setattr(store, "get_client", lambda: client)
    monkeypatch.setattr(ingest, "get_client", lambda: client)
    return client


def test_failed_rebuild_keeps_active_library(library):
    ingest.ingest_seed()
    old = store.get_collection()
    library.fail_new = True
    with pytest.raises(RuntimeError, match="embedding failed"):
        ingest.ingest_seed()
    assert store.get_collection() is old
    assert old.count() == 1
    assert store.collection_exists()
    assert list(library.collections.values()) == [old]


def test_partial_first_build_is_missing_and_cli_retries(library, monkeypatch):
    partial = library.get_or_create_collection(config.COLLECTION_NAME)
    partial.docs["partial"] = "partial"
    assert not store.collection_exists()
    monkeypatch.setattr(sys, "argv", ["ingest", "--if-missing"])
    ingest.main()
    assert store.collection_exists()
    assert store.get_collection() is not partial


def test_successful_rebuild_publishes_only_complete_collection(library):
    ingest.ingest_seed()
    old = store.get_collection()
    ingest.ingest_seed()
    active = store.get_collection()
    assert active is not old
    assert old.count() == active.count() == 1
    active.docs.clear()
    assert not store.collection_exists()


def test_failed_publication_keeps_active_and_cleans_staging(library, monkeypatch):
    ingest.ingest_seed()
    old = store.get_collection()

    def fail_replace(*args):
        raise OSError("publication failed")

    monkeypatch.setattr(ingest.os, "replace", fail_replace)
    with pytest.raises(OSError, match="publication failed"):
        ingest.ingest_seed()
    assert store.get_collection() is old
    assert list(library.collections.values()) == [old]
    assert not list(config.RAG_DIR.glob(".active_collection_*"))
