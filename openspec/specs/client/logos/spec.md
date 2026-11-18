# client/logos Specification

## Purpose

Resolve company logos on demand as external asset URLs for the selected logo set.

## Requirements

### Requirement: Resolve catalog logos by URL on demand

The client SHALL resolve a company ID and appearance to a URL from the active set. The build SHALL emit SVG assets separately from JavaScript. Resolving a URL SHALL perform no network fetch.

#### Scenario: Resolve light and dark logo URLs

- **WHEN** a known company ID and appearance are passed to the resolver
- **THEN** it returns the corresponding external asset URL for the active set

#### Scenario: Unknown company

- **WHEN** an unknown company ID is passed to the resolver
- **THEN** it returns null so the caller can display a monogram

### Requirement: Resolve a fallback company monogram

The shared logo resolver SHALL provide a fallback monogram by company ID using the geometric manifest regardless of the selected logo set. When the geometric manifest entry has no monogram, the resolver SHALL derive up to two letters from the corresponding catalog company name when available.

#### Scenario: Fallback under either logo set
- **WHEN** a company has a geometric-manifest monogram and either logo set is selected
- **THEN** the resolver supplies that geometric monogram

#### Scenario: Missing geometric monogram
- **WHEN** a catalog company has no geometric-manifest monogram
- **THEN** the resolver supplies up to two letters derived from its catalog name
