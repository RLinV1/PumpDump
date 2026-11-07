"""A stand-in for the Pumpwatch web server's mock API, so the pump and sentiment questions run offline.

It serves the same numbers as ``web/mock-api.mjs`` (GME 74, AMC 66, SNDL 32) and the same "sentiment disabled" answer
mock mode gives. The expected scores in ``questions.jsonl`` come from here, not from the tools under test.
"""

from __future__ import annotations

import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

SCORES = {"GME": 74, "AMC": 66, "SNDL": 32}
WATCHLIST = [{"ticker": t, "score": s, "modelVersion": "mock-rules-v1", "windowEnd": "2026-01-01T00:00:00Z", "staleSources": []} for t, s in SCORES.items()]
FLAGS = [
    {"id": 2 - i, "ticker": t, "raisedAt": "2026-01-01T00:00:00Z", "evidence": {
        "score": SCORES[t], "modelVersion": "mock-rules-v1", "postCount": 80 - i * 20, "tradeCount": 200 + i * 100,
        "topContributors": [{"featureGroup": "social", "delta": 30.0 - i * 5}, {"featureGroup": "market", "delta": 24.0}],
        "catalyst": {"found": False, "items": []}}}
    for i, t in enumerate(("GME", "AMC"))
]
SENTIMENT_OFF = {"ticker": "", "enabled": False, "model": "mock", "modelStatus": "disabled", "streamConnected": False,
                 "positive": 0, "negative": 0, "neutral": 0, "total": 0, "lastPostAt": None, "dropped": 0}


class _Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        path = self.path.split("?")[0]
        if path.endswith("/sentiment"):
            data = {**SENTIMENT_OFF, "ticker": path.split("/")[-2]}
        else:
            data = {"/api/v1/watchlist": WATCHLIST, "/api/v1/flags": FLAGS}.get(path)
        self.send_response(200 if data is not None else 404)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({"notice": "n", "mode": "mock", "data": data}).encode())

    def log_message(self, *args):
        pass


def serve() -> tuple[HTTPServer, str]:
    server = HTTPServer(("127.0.0.1", 0), _Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, f"http://127.0.0.1:{server.server_port}"
