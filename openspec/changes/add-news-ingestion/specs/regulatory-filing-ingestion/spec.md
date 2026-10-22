# Spec Delta

## Purpose

Collects newly filed 8-K reports from SEC EDGAR and links them to tickers, giving the system an authoritative record of material company events.

## ADDED Requirements

### Requirement: Normalized filing records
The system SHALL publish each new 8-K filing to the raw-filings topic as a record with accession number, filer CIK, company name, ticker when known, 8-K item codes, filing URL, and SEC acceptance time (event time).

#### Scenario: New 8-K filed
- **WHEN** EDGAR lists a newly accepted 8-K
- **THEN** a normalized record with its item codes is published to the raw-filings topic

### Requirement: Form filtering
The system SHALL publish only 8-K filings and amendments to them (8-K/A), and SHALL ignore other form types.

#### Scenario: Other form type
- **WHEN** EDGAR lists a new 10-Q filing
- **THEN** no record is published for it

### Requirement: Ticker mapping
The system SHALL map a filer to its ticker using the SEC company-ticker mapping, and SHALL publish the filing with an empty ticker when no mapping exists.

#### Scenario: Known filer
- **WHEN** a filing's CIK appears in the mapping
- **THEN** the record carries the mapped ticker

#### Scenario: Unmapped filer
- **WHEN** a filing's CIK is not in the mapping
- **THEN** the record is published with an empty ticker and is not dropped

### Requirement: Duplicate suppression
The system SHALL publish each accession number at most once, including after a restart.

#### Scenario: Same filing listed twice
- **WHEN** two polls both list the same accession number
- **THEN** only one record is published

### Requirement: SEC access etiquette
The system SHALL send a descriptive User-Agent with contact information on every request and SHALL stay below the SEC's published request-rate limit.

#### Scenario: Burst of new filings
- **WHEN** many filings appear at once and each needs a follow-up request
- **THEN** requests are spaced to stay under the limit and all filings are eventually published
