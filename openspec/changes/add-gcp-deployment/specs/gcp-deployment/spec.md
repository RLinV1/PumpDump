# Spec Delta

## Purpose

Lets the project run on a clean Google Cloud machine and be removed completely, with spending capped, secrets kept out of the repository and one public address for the page and the API.

## ADDED Requirements

### Requirement: One-command create and destroy
The system SHALL create the whole environment with one command and remove every resource it created with one command.

#### Scenario: Teardown
- **WHEN** the destroy command completes
- **THEN** the VM, its disk, its firewall rules and its reserved address no longer exist in the project

### Requirement: Single public entry point
The system SHALL serve the web app and the API from one public address and port, forwarding paths that start with `/api` to the API and all other paths to the web app.

#### Scenario: Page and API on one origin
- **WHEN** a browser opens the public address and the page requests `/api/v1/scores`
- **THEN** the page loads and the API answers from the same origin with no cross-origin request

#### Scenario: Live stream passes through
- **WHEN** a client opens `/api/v1/flags/stream`
- **THEN** events reach the client as they are produced, without the proxy holding them back

### Requirement: Locked-down access
The system SHALL expose only the web port to the internet, SHALL NOT expose Kafka, Postgres or service ports, and SHALL allow SSH only from the operator's address through key-based login.

#### Scenario: Port scan
- **WHEN** the VM is scanned from an unlisted address
- **THEN** only the web port responds

### Requirement: Secrets outside the repository
The system SHALL load API keys and webhook URLs from an environment file copied to the VM after boot, and SHALL NOT commit them, log them or place them in infrastructure variables or state.

#### Scenario: Repository scan
- **WHEN** the repository and the infrastructure state are scanned for the configured keys
- **THEN** none is found

### Requirement: Spending cap
The system SHALL create a billing budget alarm at a configured amount and SHALL use a machine size no larger than the stack's memory needs.

#### Scenario: Cost passes the threshold
- **WHEN** forecast spending passes the configured amount
- **THEN** an alert is sent to the configured recipient

### Requirement: Verified start
The system SHALL start every container on first boot and report ready only when the API and the web app both answer health checks.

#### Scenario: Fresh VM
- **WHEN** the VM boots for the first time
- **THEN** the readiness check passes within 10 minutes without manual steps
