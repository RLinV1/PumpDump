# Spec Delta

## Purpose

Delivers flags to the operator through chat webhooks without spamming, and makes sure every message carries its evidence and the not-advice notice.

## ADDED Requirements

### Requirement: Webhook delivery
The system SHALL send each flag to every configured webhook with the ticker, score, evidence summary and a link to the ticker's timeline.

#### Scenario: Flag emitted
- **WHEN** a flag is emitted and one webhook is configured
- **THEN** one message with the ticker, score, evidence and link is sent to it

### Requirement: Retry without duplicates
The system SHALL retry a failed delivery with backoff, and SHALL NOT send the same flag to the same webhook twice.

#### Scenario: Temporary failure
- **WHEN** a delivery fails once and then succeeds on retry
- **THEN** the webhook receives the message exactly once

### Requirement: Cooldown and digest
The system SHALL respect the per-ticker cooldown, and SHALL combine flags beyond a configured rate into one digest message.

#### Scenario: Burst of flags
- **WHEN** more flags arrive in a minute than the configured rate
- **THEN** the extra flags are sent as one digest message

### Requirement: Notice on every message
The system SHALL include the not-advice notice and the model version in every alert.

#### Scenario: Any alert
- **WHEN** an alert is sent
- **THEN** it contains the notice and the model version

### Requirement: Secrets stay secret
The system SHALL read webhook URLs from the environment and SHALL NOT write them to logs, flags or responses.

#### Scenario: Startup
- **WHEN** the notifier starts with a webhook configured
- **THEN** the URL appears in no log line or stored record
