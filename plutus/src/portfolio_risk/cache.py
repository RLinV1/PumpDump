"""Tiny in-process JSON cache with a TTL. Never raises."""

from __future__ import annotations

import time
from typing import Any

# key -> (expiry on the monotonic clock, value). shortcut: per-process, resets on restart.
_local: dict[str, tuple[float, Any]] = {}
_MAX_KEYS = 2000


def cache_get_json(key: str) -> Any | None:
    """Return the cached value for ``key`` or None on miss."""
    hit = _local.get(key)
    if hit is None:
        return None
    expiry, value = hit
    if expiry > time.monotonic():
        return value
    _local.pop(key, None)
    return None


def cache_set_json(key: str, value: Any, ttl_seconds: float) -> None:
    """Store ``value`` under ``key`` for ``ttl_seconds``."""
    if len(_local) >= _MAX_KEYS:
        _local.pop(next(iter(_local)))
    _local[key] = (time.monotonic() + max(ttl_seconds, 1), value)
