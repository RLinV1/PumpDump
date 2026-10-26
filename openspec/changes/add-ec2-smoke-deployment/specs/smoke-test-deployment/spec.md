# Spec Delta

## Purpose

Lets the project be proven on a clean cloud machine for a few hours and then removed completely, with spending capped and secrets kept out of the repository.

## ADDED Requirements

### Requirement: One-command create and destroy
The system SHALL create the whole test environment with one command and remove every resource it created with one command.

#### Scenario: Teardown
- **WHEN** the destroy command completes
- **THEN** the machine, its disk, its network rules and its key pair no longer exist in the account

### Requirement: Locked-down access
The system SHALL allow remote login only from the operator's address, SHALL expose only the ports the page and API need, and SHALL use key-based login.

#### Scenario: Port scan
- **WHEN** the machine is scanned from an unlisted address
- **THEN** no login or database port responds

### Requirement: Secrets outside the repository
The system SHALL load API keys and webhook URLs from an environment file copied to the machine at launch, and SHALL NOT commit them, log them or place them in infrastructure state.

#### Scenario: Repository scan
- **WHEN** the repository and the infrastructure state are scanned for the configured keys
- **THEN** none is found

### Requirement: Spending cap
The system SHALL create a budget alarm at a configured amount, and SHALL use the smallest machine size that runs the stack within its memory needs.

#### Scenario: Cost passes the threshold
- **WHEN** forecast spending passes the configured amount
- **THEN** an alert is sent to the operator

### Requirement: Verified start
The system SHALL start every container on first boot and report healthy only when ingestion, scoring and the API all answer health checks.

#### Scenario: Fresh machine
- **WHEN** the machine boots for the first time
- **THEN** all services report healthy within a configured time or the run is marked failed

### Requirement: Proof run
The system SHALL support a documented proof run: live ingestion for a watchlist, a recording, and a replay of the recording, with the results written to a report.

#### Scenario: Proof report
- **WHEN** the proof run finishes
- **THEN** a report lists records ingested, flags raised, the replay result and the cost estimate
