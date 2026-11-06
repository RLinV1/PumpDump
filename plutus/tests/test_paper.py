from __future__ import annotations

import threading

import pytest

from portfolio_risk import paper

TOKEN = "a" * 40


def buy(db, qty, price=10_000, token=TOKEN, ticker="GME"):
    return paper.place_order(db, token, "BUY", ticker, qty, price)


def test_new_account_starts_with_cash_only(db):
    acct = paper.get_account(db, TOKEN)
    assert acct["cashCents"] == paper.START_CASH_CENTS and acct["positions"] == [] and acct["pnlCents"] == 0


def test_buy_then_sell_moves_cash_and_pnl(db):
    after_buy = buy(db, 10, 10_000)  # $100.00 each
    assert after_buy["cashCents"] == paper.START_CASH_CENTS - 100_000
    assert after_buy["positions"][0]["qty"] == 10 and after_buy["pnlCents"] == 0
    after_sell = paper.place_order(db, TOKEN, "SELL", "GME", 4, 11_000)
    assert after_sell["cashCents"] == paper.START_CASH_CENTS - 100_000 + 44_000
    assert after_sell["realizedCents"] == 4_000  # 4 shares * $10 gain
    assert after_sell["positions"][0]["qty"] == 6
    final = paper.place_order(db, TOKEN, "SELL", "GME", 6, 11_000)
    assert final["positions"] == [] and final["pnlCents"] == 10_000 == final["realizedCents"]
    assert [o["side"] for o in final["orders"]] == ["SELL", "SELL", "BUY"]


def test_average_cost_across_two_buys(db):
    buy(db, 1, 10_000)
    out = buy(db, 1, 20_000)
    assert out["positions"][0]["avgCostCents"] == 15_000


def test_insufficient_cash_is_refused_and_changes_nothing(db):
    with pytest.raises(paper.PaperError, match="Not enough paper cash"):
        buy(db, 10_000, 10_000)  # $1,000,000
    assert paper.get_account(db, TOKEN)["cashCents"] == paper.START_CASH_CENTS


def test_oversell_and_short_selling_are_refused(db):
    with pytest.raises(paper.PaperError, match="Short selling"):
        paper.place_order(db, TOKEN, "SELL", "GME", 1, 10_000)
    buy(db, 2)
    with pytest.raises(paper.PaperError, match="cannot sell 3"):
        paper.place_order(db, TOKEN, "SELL", "GME", 3, 10_000)


@pytest.mark.parametrize("qty", [0, -1, 1.5, "5", True, paper.MAX_QTY + 1, None])
def test_bad_quantities_are_refused(db, qty):
    with pytest.raises(paper.PaperError):
        buy(db, qty)


@pytest.mark.parametrize("ticker", ["gme", "TOOLONG", "G1", "", "GM E", None])
def test_bad_tickers_are_refused(db, ticker):
    with pytest.raises(paper.PaperError):
        buy(db, 1, ticker=ticker)


@pytest.mark.parametrize("price", [0, -5, None, 1.5, float("nan")])
def test_missing_or_bad_price_refuses_the_order(db, price):
    with pytest.raises(paper.PaperError) as err:
        buy(db, 1, price=price)
    assert err.value.status == 503


def test_double_submit_cannot_overspend(db):
    # each order costs 60% of the cash; only one may fill
    price = paper.START_CASH_CENTS * 6 // 10
    results, barrier = [], threading.Barrier(2)

    def go():
        barrier.wait()
        try:
            buy(db, 1, price)
            results.append("ok")
        except paper.PaperError:
            results.append("refused")

    threads = [threading.Thread(target=go) for _ in range(2)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    assert sorted(results) == ["ok", "refused"]
    assert paper.get_account(db, TOKEN)["cashCents"] == paper.START_CASH_CENTS - price


def test_reset_restores_cash_and_clears_history(db):
    buy(db, 5)
    out = paper.reset_account(db, TOKEN)
    assert out["cashCents"] == paper.START_CASH_CENTS and out["positions"] == [] and out["orders"] == []


def test_accounts_are_isolated(db):
    buy(db, 5)
    other = paper.get_account(db, "b" * 40)
    assert other["positions"] == [] and other["cashCents"] == paper.START_CASH_CENTS


@pytest.mark.parametrize("token", ["", "short", "x" * 65, "a" * 31 + "!", None])
def test_bad_tokens_are_rejected(db, token):
    with pytest.raises(paper.PaperError) as err:
        paper.get_account(db, token)
    assert err.value.status == 401


def test_only_a_hash_of_the_token_is_stored(db):
    paper.get_account(db, TOKEN)
    assert TOKEN.encode() not in db.read_bytes()


def test_account_cap_purges_idle_accounts_then_refuses(db, monkeypatch):
    monkeypatch.setattr(paper, "MAX_ACCOUNTS", 2)
    paper.get_account(db, "a" * 40, now=0)
    paper.get_account(db, "b" * 40, now=10)
    # both are fresh: a third is refused
    with pytest.raises(paper.PaperError) as err:
        paper.get_account(db, "c" * 40, now=20)
    assert err.value.status == 503
    # long after, the idle ones are purged and the newcomer fits
    paper.get_account(db, "c" * 40, now=paper.IDLE_DAYS * 86400 + 100)


def test_old_orders_are_trimmed(db, monkeypatch):
    monkeypatch.setattr(paper, "MAX_ORDERS_KEPT", 3)
    for _ in range(5):
        buy(db, 1, 100)
    assert len(paper.get_account(db, TOKEN)["orders"]) == 3
