from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from api import service


@pytest.fixture
def client():
    return TestClient(service.app)


def test_lookup_route(client):
    ok = client.get("/lookup/AAPL")
    assert ok.status_code == 200 and ok.json()["dataMode"] == "mock"
    assert client.get("/lookup/aapl").status_code == 400
    assert client.get("/healthz").json() == {"ok": True}
