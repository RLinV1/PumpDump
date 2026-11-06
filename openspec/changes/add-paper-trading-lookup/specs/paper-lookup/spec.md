# Spec Delta

## Purpose

Lets a reader look up one stock and practise simulated paper trading from the live terminal, without sign-in, a broker, real orders or any user data beyond positions.

## ADDED Requirements

### Requirement: Stock lookup
The `/live` terminal SHALL accept `LOOK <TICKER>` (alias `DES`) and show, in numbered panel 7, the name, sector, price, daily move, market cap and P/E, price performance, SMAs, RSI, 52-week range, beta and volatility, labelled MOCK or LIVE, with loading and error states and a Retry button.

#### Scenario: Valid ticker
- **WHEN** the reader types `LOOK GME`
- **THEN** panel 7 shows a loading state and then the figures with a data-mode label

#### Scenario: Invalid ticker
- **WHEN** the ticker is not 1 to 5 letters
- **THEN** the command line shows a usage error and nothing is requested

### Requirement: Paper trading commands and panel
The terminal SHALL accept `BUY <TICKER> <QTY>`, `SELL <TICKER> <QTY>`, `PT` and `PT RESET`, and show cash, positions, P&L and order history in numbered panel 8 marked PAPER. Trading SHALL be simulated only.

#### Scenario: Buy then sell
- **WHEN** the reader buys 10 shares and then sells 10
- **THEN** cash falls by the fill cost and is restored by the sale, and realized P&L reflects the price difference

#### Scenario: Reset needs confirmation
- **WHEN** the reader types `PT RESET`
- **THEN** nothing is cleared until `PT RESET CONFIRM` or the panel's Confirm button is used

### Requirement: Ledger rules
The ledger SHALL use integer cents and whole shares from 1 to 10,000 per order, refuse a buy above available cash, refuse a sell above the held quantity (no shorting), and apply every order atomically so concurrent submissions cannot spend the same cash.

#### Scenario: Insufficient cash
- **WHEN** an order costs more than the cash balance
- **THEN** it is refused with a clear message and the account is unchanged

#### Scenario: Double submit
- **WHEN** two orders that together exceed the cash arrive at the same moment
- **THEN** exactly one fills

### Requirement: Server-decided prices
The server SHALL decide every fill price. The browser SHALL send only side, ticker and quantity. With no price available the order SHALL be refused and no fill invented.

#### Scenario: Client sends a price
- **WHEN** a request includes a `price`
- **THEN** it is ignored and the fill uses the server's price

#### Scenario: No live quote
- **WHEN** live mode has no Alpaca quote for the ticker
- **THEN** the order is refused with a message naming the ticker

### Requirement: Anonymous identity
Accounts SHALL be identified by a random token the browser keeps and sends in `X-Paper-Token`. The service SHALL store only a hash of it, cap the number of accounts, expire idle accounts and keep no user data beyond positions and orders.

#### Scenario: Missing or malformed token
- **WHEN** the token is absent or not 32 to 64 URL-safe characters
- **THEN** the route answers 401 and nothing is forwarded

#### Scenario: Account cap
- **WHEN** the account cap is reached and no account is idle
- **THEN** a new account is refused with a clear message

### Requirement: Public routes
All public routes SHALL go through `web/server.mjs`, validate input (ticker `^[A-Z]{1,5}$`, integer quantity, JSON only, 1 KB body), rate limit each client and all clients together, and reach a private service that publishes no port.

#### Scenario: Too many writes
- **WHEN** one client sends more than 20 write requests in a minute
- **THEN** the route answers 429 with a Retry-After and nothing is forwarded

### Requirement: Public data policy
The public deployment SHALL show only mock data, and every figure SHALL be labelled MOCK or LIVE. The deploy script SHALL keep the service on mock data.

#### Scenario: Deploy
- **WHEN** `deploy/up.sh` writes the VM `.env`
- **THEN** it contains no `ALPACA_` line and sets `PLUTUS_USE_MOCK_DATA=1`

### Requirement: Not investment advice
The panels and routes SHALL state that trading is simulated, with no broker and no real orders, and is not investment advice.

#### Scenario: Panel footer
- **WHEN** panel 8 is shown
- **THEN** it says the account is simulated and not investment advice
