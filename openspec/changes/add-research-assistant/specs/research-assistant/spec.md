# Spec Delta

## Purpose

Lets a reader ask a plain-English question in the live terminal and get an answer that shows its tools and sources, grounded in Pumpwatch's own risk data, without exposing the owner's Claude credits, portfolios or any trading.

## ADDED Requirements

### Requirement: Grounded pump-risk answers
The assistant SHALL answer pump questions from Pumpwatch's read API through a `get_pump_risk` tool that returns the latest score, verdict, top contributors, recent flags and catalyst result for the ticker, and SHALL report whether that data is mock or live.

#### Scenario: Tracked ticker
- **WHEN** the question is "Is GME being pumped?" and Pumpwatch scores GME
- **THEN** the answer states the score and verdict, lists `get_pump_risk` among the tools used and cites Pumpwatch as a source

#### Scenario: Ticker Pumpwatch does not score
- **WHEN** the ticker has no score and no flag
- **THEN** the answer says Pumpwatch does not score it and invents no number

#### Scenario: Pumpwatch API down
- **WHEN** the read API cannot be reached
- **THEN** the tool returns an error value, the answer says it could not read the data, and no stack trace or host name reaches the browser

### Requirement: Terminal command and panel
The `/live` terminal SHALL accept `ASK <question>` and show the result in a numbered Assistant panel with loading, error and empty states, the tools used and the cited sources.

#### Scenario: Question keeps its case
- **WHEN** the reader types `ASK Is GME being pumped?`
- **THEN** the question is sent exactly as typed, not upper-cased, and panel 7 shows a loading state until the answer arrives

#### Scenario: Failure
- **WHEN** the request fails or is rate limited
- **THEN** panel 7 shows the reason and a Retry button, and the rest of the terminal keeps working

### Requirement: Not investment advice
Every assistant answer SHALL carry a not-investment-advice notice, and the assistant SHALL NOT place orders or call a broker.

#### Scenario: Model omits the notice
- **WHEN** the agent's text lacks the notice
- **THEN** the service appends it before responding

### Requirement: Spend and abuse limits
The public route SHALL reject questions over 300 characters, bodies over 2 KB and non-JSON requests, SHALL rate limit each client and all clients together, and the service SHALL cap agent runs per minute.

#### Scenario: Too many questions
- **WHEN** one client sends more than 5 questions in a minute
- **THEN** the route answers 429 with a Retry-After and nothing is forwarded

### Requirement: Public data policy
On the public deployment the assistant SHALL use mock market data and the mock agent, and the deploy script SHALL NOT copy `ANTHROPIC_API_KEY` to the VM. The service SHALL NOT expose portfolio or paper-trading tools.

#### Scenario: Deploy
- **WHEN** `deploy/up.sh` writes the VM `.env`
- **THEN** it contains no `ANTHROPIC_API_KEY` line and sets `PLUTUS_USE_MOCK_DATA=1` and `PLUTUS_USE_MOCK_LLM=1`

#### Scenario: Portfolio question
- **WHEN** the reader asks about "my portfolio"
- **THEN** the answer says portfolio questions are unavailable here and no portfolio tool runs
