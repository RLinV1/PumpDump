# Spec Delta

## Purpose

Lets the project run on AWS from code, be removed completely, and stay on labelled mock data, with spending alarmed and secrets outside files and logs.

## ADDED Requirements

### Requirement: Create and destroy from code
The system SHALL define the whole AWS environment in Terraform and provide one script to create it and one to destroy every resource it created.

#### Scenario: Teardown
- **WHEN** `deploy/aws-down.sh` completes
- **THEN** the load balancer, ECS services, RDS instance, ECR repositories and any MSK cluster no longer exist

### Requirement: Stream route bypasses the web server
The system SHALL route `/api/v1/flags/stream` directly to the API and all other paths to the web service, with a load balancer idle timeout above the stream heartbeat.

#### Scenario: Live stream
- **WHEN** a client opens `/api/v1/flags/stream` through the load balancer
- **THEN** the API answers with an event stream that stays open past 60 seconds

### Requirement: Private data and least-privilege access
The system SHALL keep the database in private subnets, accept task traffic only from the load balancer or other tasks, and grant IAM actions on specific resources where AWS supports it.

#### Scenario: Direct access
- **WHEN** a task port or the database port is reached from the internet
- **THEN** the connection is refused

### Requirement: Secrets outside files
The system SHALL inject the database password through Secrets Manager and the ECS `secrets` setting, and SHALL NOT place secrets in `*.tf`, example variable files, scripts or workflow files.

#### Scenario: Repository scan
- **WHEN** the repository is scanned for credentials
- **THEN** none is found

### Requirement: Mock data only
The system SHALL run tasks with `DATA_MODE=mock` and no Alpaca or Anthropic keys by default, and SHALL allow `live` only through the `data_mode` variable, still without keys.

#### Scenario: Invalid mode
- **WHEN** `data_mode` is set to any value other than `mock` or `live`
- **THEN** Terraform rejects it before planning

### Requirement: Correct client addresses
The system SHALL set `TRUST_PROXY_HEADERS` on the web service and `API_TRUSTED_PROXIES` to a pattern covering only the VPC range, and SHALL configure the load balancer to append to `X-Forwarded-For`.

#### Scenario: Forged header
- **WHEN** a client sends its own `X-Forwarded-For`
- **THEN** the address used for rate limiting is the one the load balancer saw

### Requirement: Kafka topics in both modes
The system SHALL create the same topics as `docker-compose.yml` whether Kafka runs as a single task or as Amazon MSK, and SHALL document that the single-task broker loses its data on restart.

#### Scenario: MSK off
- **WHEN** `enable_msk` is false
- **THEN** a single-node Kafka task runs with a sidecar that creates the topics

### Requirement: Deployment only on manual request
The system SHALL NOT deploy to AWS from push or pull request events; the deploy workflow SHALL run only on manual dispatch, authenticating through GitHub OIDC.

#### Scenario: Push to main
- **WHEN** a commit is pushed
- **THEN** no AWS credentials are requested and nothing is deployed

### Requirement: Cost guards
The system SHALL provide an AWS Budgets alarm with a default of 25 USD and CloudWatch alarms that notify an SNS topic, and the documentation SHALL state that running resources are billed and must be destroyed.

#### Scenario: Budget configured
- **WHEN** `budget_email` is set
- **THEN** a monthly budget notifies it at 80 percent of actual and 100 percent of forecast spend
