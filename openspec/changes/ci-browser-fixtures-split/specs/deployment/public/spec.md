## MODIFIED Requirements

### Requirement: Browser CI headroom
CI SHALL run production compose-browser, isolated-fixture compose-browser-fixtures and deterministic compose-browser-seeded as separate parallel jobs with 35-minute limits, cached Playwright browsers, per-job sanitized evidence artifacts and independent cleanup. Public staging smoke SHALL remain opt-in outside CI and verify two browsers complete setup and a turn over the staging API WSS connection.

#### Scenario: Delivery validation
- **WHEN** a PR runs CI
- **THEN** all browser jobs gate whole-workflow success and measured durations establish remaining headroom
