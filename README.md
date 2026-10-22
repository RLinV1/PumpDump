# PumpDump (Pumpwatch)

Real-time detection of coordinated pump-and-dump activity for retail investors.
Pumpwatch watches social chatter, news, SEC filings and market data together,
and flags tickers where hype is rising without a real catalyst behind it.

The output is a risk signal with its evidence. It is not buy or sell advice.

## How it works

1. **Ingest.** Connectors publish normalized records to Kafka topics:
   - `raw-posts`: Reddit posts
   - `ticks`: Alpaca trades, keyed by ticker
   - `raw-news`: Alpaca News, Finnhub and press-release RSS
   - `raw-filings`: SEC EDGAR 8-K filings
   - `ingest-dlq`: records that failed validation
2. **Record and replay.** Every record is stored with its event time and can be
   replayed into the same topics at original or accelerated speed, so backtests
   and demos run the same code as live data.
3. **Score (planned).** An ML model combines social features (volume, account
   age, near-duplicate text) with price and volume from Alpaca, and checks
   whether news or an 8-K explains the move.
4. **Alert (planned).** A web app shows a live risk score per ticker with the
   evidence behind it.

## Stack

Java 21, Spring Boot, Kafka, PostgreSQL. Planned: Python for model training,
React for the app, Terraform for a short AWS test run.

## Project status

Planning is done with [OpenSpec](https://github.com/Fission-AI/OpenSpec). No
application code yet. The plans live in `openspec/changes/`:

| Change | Scope |
| --- | --- |
| `add-ingestion-pipeline` | Reddit and Alpaca connectors, Kafka topics, dead-letter handling, record and replay |
| `add-news-ingestion` | Alpaca News, SEC EDGAR 8-K, Finnhub and press-release RSS |

## Workflow

Work happens on type-prefixed branches (`feat/...`, `docs/...`, `chore/...`)
with Conventional Commit messages. Changes reach `main` only through a pull
request.
