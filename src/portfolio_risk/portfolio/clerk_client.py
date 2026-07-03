"""Clerk Backend API client -- currently only used to resolve a real display
name for the paper-trading leaderboard (JWT verification elsewhere in the app
uses JWKS only and never needs this).

Requires ``CLERK_SECRET_KEY``. When unset, or a lookup fails/times out,
callers get ``None`` back and fall back to an anonymized handle -- a leaderboard
must never break because Clerk is slow or unreachable.
"""

from __future__ import annotations

import logging
import sys
import time

import requests

from .. import config

log = logging.getLogger("portfolio_risk.portfolio.clerk_client")
if not log.handlers:  # stderr only
    _h = logging.StreamHandler(stream=sys.stderr)
    _h.setFormatter(logging.Formatter("%(name)s %(levelname)s: %(message)s"))
    log.addHandler(_h)
    log.setLevel(logging.INFO)

_TTL_SECONDS = 300
_cache: dict[str, tuple[str | None, float]] = {}


def display_name(user_id: str) -> str | None:
    """Best-effort Clerk username (or first+last name, or email local-part).

    Cached for ``_TTL_SECONDS`` per user so a leaderboard refresh doesn't
    hammer the Clerk API on every poll.
    """
    key = config.clerk_secret_key()
    if not key or user_id == "anonymous":
        return None

    now = time.time()
    cached = _cache.get(user_id)
    if cached is not None and now - cached[1] < _TTL_SECONDS:
        return cached[0]

    name = _fetch(user_id, key)
    _cache[user_id] = (name, now)
    return name


def _fetch(user_id: str, key: str) -> str | None:
    try:
        resp = requests.get(
            f"https://api.clerk.com/v1/users/{user_id}",
            headers={"Authorization": f"Bearer {key}"},
            timeout=3,
        )
        if not resp.ok:
            log.warning("Clerk user lookup for %s failed: HTTP %s", user_id, resp.status_code)
            return None
        data = resp.json()
    except Exception as exc:  # noqa: BLE001 - never let this break a caller
        log.warning("Clerk user lookup for %s errored: %s", user_id, exc)
        return None

    username = (data.get("username") or "").strip()
    if username:
        return username

    full_name = " ".join(
        filter(None, [(data.get("first_name") or "").strip(), (data.get("last_name") or "").strip()])
    ).strip()
    if full_name:
        return full_name

    emails = data.get("email_addresses") or []
    if emails:
        local_part = (emails[0].get("email_address") or "").split("@")[0].strip()
        if local_part:
            return local_part

    return None
