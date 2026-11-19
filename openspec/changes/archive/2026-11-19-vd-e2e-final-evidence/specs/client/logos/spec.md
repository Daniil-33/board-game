## MODIFIED Requirements

### Requirement: Brand logo file size
Every light and dark SVG in the brand logo set served by the client SHALL be no larger than 20,000 bytes unless it is recorded as an explicit exception in `docs/efforts/visual-design/logo-exceptions.md`. An exception SHALL retain the original or the smallest candidate that passes the approved visual tolerance, and SHALL include raw and gzip byte sizes and the reason it remains oversized.

#### Scenario: Logo size limit
- **WHEN** the production client build emits the brand light and dark logo sets
- **THEN** every logo file SHALL be at most 20,000 bytes or be listed as an explicit, evidence-backed exception
