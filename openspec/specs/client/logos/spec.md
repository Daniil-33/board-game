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
