## ADDED Requirements

### Requirement: Two catalog logo sets

The catalog SHALL provide a geometric set with preserved commissioned SVGs and a brand set with the owner's pixel-equivalent v2 SVGs. Both SHALL provide manifests and one safe 64 by 64 viewBox SVG for each company and appearance. Each SVG SHALL have a fixed appearance independent of browser media preferences. The brand set SHALL remain within 2,200,000 raw SVG bytes and 800,000 summed per-file gzip bytes.

#### Scenario: Brand set covers the unconfirmed company

- **WHEN** the brand manifest is used for microfinance-4
- **THEN** both appearances resolve to byte-identical copies from the geometric set
