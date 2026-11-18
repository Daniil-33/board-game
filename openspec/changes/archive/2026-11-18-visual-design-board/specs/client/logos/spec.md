## ADDED Requirements

### Requirement: Resolve a fallback company monogram

The shared logo resolver SHALL provide a fallback monogram by company ID using the geometric manifest regardless of the selected logo set. When the geometric manifest entry has no monogram, the resolver SHALL derive up to two letters from the corresponding catalog company name when available.

#### Scenario: Fallback under either logo set
- **WHEN** a company has a geometric-manifest monogram and either logo set is selected
- **THEN** the resolver supplies that geometric monogram

#### Scenario: Missing geometric monogram
- **WHEN** a catalog company has no geometric-manifest monogram
- **THEN** the resolver supplies up to two letters derived from its catalog name
