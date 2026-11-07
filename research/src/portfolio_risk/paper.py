"""Simulated paper trading: anonymous accounts, whole shares, integer cents, no short selling.

SIMULATED ONLY. There is no broker and no real order. An account is identified by a random token the
browser keeps; only its SHA-256 hash is stored. Fill prices are decided by the caller's server-side quote
source (see ``api/service.py``), never by the client. Every write runs inside one ``BEGIN IMMEDIATE``
transaction, so two concurrent orders cannot both spend the same cash.
"""

from __future__ import annotations

import hashlib
import re
import sqlite3
import threading
import time

START_CASH_CENTS = 100_000 * 100
MAX_QTY = 10_000  # per order
MAX_ACCOUNTS = 5_000  # public VM guard; idle accounts are purged first
IDLE_DAYS = 30
MAX_ORDERS_KEPT = 200  # per account; older rows are dropped
ORDERS_SHOWN = 50

TICKER = re.compile(r"^[A-Z]{1,5}$")
TOKEN = re.compile(r"^[A-Za-z0-9_-]{32,64}$")

_SCHEMA = """
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY, cash_cents INTEGER NOT NULL, realized_cents INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL, last_seen INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS positions (
  account TEXT NOT NULL, ticker TEXT NOT NULL, qty INTEGER NOT NULL, cost_cents INTEGER NOT NULL,
  PRIMARY KEY (account, ticker));
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT, account TEXT NOT NULL, ts INTEGER NOT NULL,
  side TEXT NOT NULL, ticker TEXT NOT NULL, qty INTEGER NOT NULL, price_cents INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS orders_account ON orders (account, id);
"""


class PaperError(Exception):
    """A refused request; the message is safe to show to the user."""

    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


_ready: set[str] = set()
_ready_lock = threading.Lock()


def _connect(path) -> sqlite3.Connection:
    conn = sqlite3.connect(path, timeout=10, isolation_level=None)  # explicit transactions below
    conn.row_factory = sqlite3.Row
    with _ready_lock:  # create the schema once per file, not racing on every request
        if str(path) not in _ready:
            conn.execute("PRAGMA journal_mode=WAL")
            conn.executescript(_SCHEMA)
            _ready.add(str(path))
    return conn


def _account_id(token: str) -> str:
    if not isinstance(token, str) or not TOKEN.match(token):
        raise PaperError("Missing or invalid paper account token.", 401)
    return hashlib.sha256(token.encode()).hexdigest()


def _open_account(conn: sqlite3.Connection, acct: str, now: int) -> None:
    """Touch the account, creating it if the cap allows. Must run inside a transaction."""
    if conn.execute("UPDATE accounts SET last_seen=? WHERE id=?", (now, acct)).rowcount:
        return
    count = conn.execute("SELECT COUNT(*) FROM accounts").fetchone()[0]
    if count >= MAX_ACCOUNTS:
        cutoff = now - IDLE_DAYS * 86400
        conn.execute("DELETE FROM positions WHERE account IN (SELECT id FROM accounts WHERE last_seen<?)", (cutoff,))
        conn.execute("DELETE FROM orders WHERE account IN (SELECT id FROM accounts WHERE last_seen<?)", (cutoff,))
        conn.execute("DELETE FROM accounts WHERE last_seen<?", (cutoff,))
        if conn.execute("SELECT COUNT(*) FROM accounts").fetchone()[0] >= MAX_ACCOUNTS:
            raise PaperError("Paper trading is full right now. Try again later.", 503)
    conn.execute("INSERT INTO accounts (id, cash_cents, created_at, last_seen) VALUES (?,?,?,?)",
                 (acct, START_CASH_CENTS, now, now))


def _state(conn: sqlite3.Connection, acct: str, marks: dict[str, int] | None) -> dict:
    """The account as the panel shows it. ``marks`` are current prices in cents per ticker (may be partial)."""
    a = conn.execute("SELECT * FROM accounts WHERE id=?", (acct,)).fetchone()
    marks = marks or {}
    positions, value = [], 0
    for p in conn.execute("SELECT * FROM positions WHERE account=? AND qty>0 ORDER BY ticker", (acct,)):
        mark = marks.get(p["ticker"])
        mv = None if mark is None else p["qty"] * mark
        positions.append({
            "ticker": p["ticker"], "qty": p["qty"], "avgCostCents": round(p["cost_cents"] / p["qty"]),
            "costCents": p["cost_cents"], "markCents": mark, "valueCents": mv,
            "pnlCents": None if mv is None else mv - p["cost_cents"],
        })
        value += p["cost_cents"] if mv is None else mv  # unpriced positions are carried at cost
    orders = [
        {"id": o["id"], "ts": o["ts"], "side": o["side"], "ticker": o["ticker"], "qty": o["qty"], "priceCents": o["price_cents"]}
        for o in conn.execute("SELECT * FROM orders WHERE account=? ORDER BY id DESC LIMIT ?", (acct, ORDERS_SHOWN))
    ]
    total = a["cash_cents"] + value
    return {
        "cashCents": a["cash_cents"], "positionsValueCents": value, "totalCents": total,
        "startCents": START_CASH_CENTS, "pnlCents": total - START_CASH_CENTS, "realizedCents": a["realized_cents"],
        "positions": positions, "orders": orders,
    }


def held_tickers(db_path, token: str) -> list[str]:
    """Tickers the account holds, so the caller can mark them to market before reading."""
    acct = _account_id(token)
    conn = _connect(db_path)
    try:
        return [r[0] for r in conn.execute("SELECT ticker FROM positions WHERE account=? AND qty>0", (acct,))]
    finally:
        conn.close()


def get_account(db_path, token: str, marks: dict[str, int] | None = None, now: int | None = None) -> dict:
    acct, now = _account_id(token), int(now if now is not None else time.time())
    conn = _connect(db_path)
    try:
        conn.execute("BEGIN IMMEDIATE")
        try:
            _open_account(conn, acct, now)
            out = _state(conn, acct, marks)
            conn.execute("COMMIT")
        except BaseException:
            conn.execute("ROLLBACK")
            raise
        return out
    finally:
        conn.close()


def place_order(db_path, token: str, side: str, ticker: str, qty: int, price_cents: int,
                marks: dict[str, int] | None = None, now: int | None = None) -> dict:
    """Fill a market order at ``price_cents`` (decided by the server, never the client)."""
    acct, now = _account_id(token), int(now if now is not None else time.time())
    if side not in ("BUY", "SELL"):
        raise PaperError("Side must be BUY or SELL.")
    if not isinstance(ticker, str) or not TICKER.match(ticker):
        raise PaperError("A ticker is 1 to 5 capital letters.")
    if isinstance(qty, bool) or not isinstance(qty, int) or not 1 <= qty <= MAX_QTY:
        raise PaperError(f"Quantity must be a whole number from 1 to {MAX_QTY:,}.")
    if isinstance(price_cents, bool) or not isinstance(price_cents, int) or price_cents <= 0:
        raise PaperError(f"No price is available for {ticker}, so the order was refused.", 503)
    conn = _connect(db_path)
    try:
        conn.execute("BEGIN IMMEDIATE")
        try:
            _open_account(conn, acct, now)
            a = conn.execute("SELECT cash_cents FROM accounts WHERE id=?", (acct,)).fetchone()
            pos = conn.execute("SELECT qty, cost_cents FROM positions WHERE account=? AND ticker=?", (acct, ticker)).fetchone()
            held, cost = (pos["qty"], pos["cost_cents"]) if pos else (0, 0)
            amount = qty * price_cents
            if side == "BUY":
                if amount > a["cash_cents"]:
                    raise PaperError(f"Not enough paper cash: {qty} {ticker} costs ${amount / 100:,.2f}, you have ${a['cash_cents'] / 100:,.2f}.")
                conn.execute("UPDATE accounts SET cash_cents=cash_cents-? WHERE id=?", (amount, acct))
                conn.execute("INSERT INTO positions (account, ticker, qty, cost_cents) VALUES (?,?,?,?) "
                             "ON CONFLICT (account, ticker) DO UPDATE SET qty=qty+excluded.qty, cost_cents=cost_cents+excluded.cost_cents",
                             (acct, ticker, qty, amount))
            else:
                if qty > held:
                    raise PaperError(f"You hold {held} {ticker} on paper and cannot sell {qty}. Short selling is not supported.")
                basis = cost * qty // held  # average cost of the shares sold, in whole cents
                conn.execute("UPDATE accounts SET cash_cents=cash_cents+?, realized_cents=realized_cents+? WHERE id=?",
                             (amount, amount - basis, acct))
                conn.execute("UPDATE positions SET qty=qty-?, cost_cents=cost_cents-? WHERE account=? AND ticker=?", (qty, basis, acct, ticker))
                conn.execute("DELETE FROM positions WHERE account=? AND qty=0", (acct,))
            conn.execute("INSERT INTO orders (account, ts, side, ticker, qty, price_cents) VALUES (?,?,?,?,?,?)",
                         (acct, now, side, ticker, qty, price_cents))
            conn.execute("DELETE FROM orders WHERE account=? AND id NOT IN (SELECT id FROM orders WHERE account=? ORDER BY id DESC LIMIT ?)",
                         (acct, acct, MAX_ORDERS_KEPT))
            out = _state(conn, acct, {**(marks or {}), ticker: price_cents})
            conn.execute("COMMIT")
        except BaseException:
            conn.execute("ROLLBACK")
            raise
        return out
    finally:
        conn.close()


def reset_account(db_path, token: str, now: int | None = None) -> dict:
    """Back to the starting cash with no positions and no history."""
    acct, now = _account_id(token), int(now if now is not None else time.time())
    conn = _connect(db_path)
    try:
        conn.execute("BEGIN IMMEDIATE")
        try:
            _open_account(conn, acct, now)
            conn.execute("DELETE FROM positions WHERE account=?", (acct,))
            conn.execute("DELETE FROM orders WHERE account=?", (acct,))
            conn.execute("UPDATE accounts SET cash_cents=?, realized_cents=0 WHERE id=?", (START_CASH_CENTS, acct))
            out = _state(conn, acct, None)
            conn.execute("COMMIT")
        except BaseException:
            conn.execute("ROLLBACK")
            raise
        return out
    finally:
        conn.close()
