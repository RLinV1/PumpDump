"""Admin-only endpoints, gated by a shared secret (``ADMIN_API_KEY``).

Not wired into any UI -- call with curl/Postman using the ``X-Admin-Key``
header. Lets you comp a Clerk user unlimited AI prompts instantly: no
redeploy, no AWS secret edit, takes effect on their very next request (see
``portfolio_risk.portfolio.billing.set_unlimited``).
"""

from __future__ import annotations

import hmac

from fastapi import APIRouter, Header, HTTPException

from portfolio_risk import config
from portfolio_risk.portfolio import billing

router = APIRouter(prefix="/api/admin", tags=["admin"])


def _check_admin(x_admin_key: str | None) -> None:
    expected = config.admin_api_key()
    if not expected:
        raise HTTPException(status_code=503, detail="Admin API not configured (no ADMIN_API_KEY).")
    if not x_admin_key or not hmac.compare_digest(x_admin_key, expected):
        raise HTTPException(status_code=401, detail="Invalid admin key")


@router.post("/unlimited")
def set_unlimited(payload: dict, x_admin_key: str | None = Header(default=None)) -> dict:
    """Grant or revoke comped unlimited AI prompts for a Clerk user ID."""
    _check_admin(x_admin_key)
    user_id = str((payload or {}).get("user_id", "")).strip()
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id is required")
    enabled = bool((payload or {}).get("enabled", True))
    billing.set_unlimited(user_id, enabled)
    return {"user_id": user_id, "unlimited": enabled}


@router.get("/unlimited/{user_id}")
def get_unlimited(user_id: str, x_admin_key: str | None = Header(default=None)) -> dict:
    _check_admin(x_admin_key)
    return {"user_id": user_id, "unlimited": billing.is_unlimited(user_id)}
