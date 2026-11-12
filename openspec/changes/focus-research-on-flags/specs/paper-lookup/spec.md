# Spec Delta

## Purpose

Narrows `paper-lookup` to stock lookup and a flag-scoped assistant. Paper trading is gone.

## REMOVED Requirements

### Requirement: Paper trading commands and panel
Removed: `BUY`, `SELL`, `PT` and `PT RESET`, the Paper tab and its account view no longer exist.

### Requirement: Ledger rules
Removed: there is no ledger.

### Requirement: Server-decided prices
Removed: nothing is filled, so nothing is priced.

### Requirement: Anonymous identity
Removed: there are no accounts or account tokens.

## MODIFIED Requirements

### Requirement: Public routes
The web server SHALL expose `GET /api/v1/lookup/:ticker` and `POST /api/v1/assistant/ask`, validate input and rate limit per client before forwarding to the private service. There are no write routes besides the assistant question.

#### Scenario: Too many reads
- **WHEN** a client sends more than 60 lookups in a minute
- **THEN** it receives 429 with `Retry-After`

## ADDED Requirements

### Requirement: Ask about a flag
Each flag shown on `/live` SHALL offer "Ask about this flag", which opens the assistant chat with the ticker and its current score and evidence as context. The chat SHALL stay usable without a flag, and the palette entry SHALL read "Ask about a flag".

#### Scenario: Flag action
- **WHEN** the reader activates "Ask about this flag" on a GME flag
- **THEN** the chat opens and asks why GME is flagged, sending the flag's score and evidence as context

#### Scenario: Bad context
- **WHEN** the context is not a string, is over 600 characters or has control characters
- **THEN** the web door answers 400 and nothing is forwarded

### Requirement: Risk framing, no advice
The assistant SHALL explain why a ticker is or is not flagged and what the evidence means, frame everything as risk detection, and never say buy, sell or hold or predict prices. It SHALL have no tool that reads or changes a trading account.

#### Scenario: Advice request
- **WHEN** the reader asks "Should I buy GME?"
- **THEN** the assistant declines to give buy, sell or hold advice and offers to explain the flag instead
