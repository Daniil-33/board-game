# client/logos Specification

## Purpose

Resolve company logos on demand as external asset URLs for the selected logo set.

## Requirements

### Requirement: Resolve catalog logos by URL on demand

The client SHALL resolve a company ID and appearance to a URL from the active
set. The build SHALL emit SVG assets separately from JavaScript. Resolving a
URL SHALL perform no network fetch. A screen SHALL request only logo URLs it
renders, and the game screen SHALL request only the board and panels' required
logos, without downloading the full logo set.

#### Scenario: Resolve light and dark logo URLs

- **WHEN** a known company ID and appearance are passed to the resolver
- **THEN** it returns the corresponding external asset URL for the active set

#### Scenario: Unknown company

- **WHEN** an unknown company ID is passed to the resolver
- **THEN** it returns null so the caller can display a monogram

#### Scenario: Screen requests only visible logos

- **WHEN** login or lobby is shown without a logo, or the game screen renders a subset of catalog companies
- **THEN** the browser SHALL request no logo on login or lobby and SHALL request only the rendered game-screen logos

### Requirement: Resolve a fallback company monogram

The shared logo resolver SHALL provide a fallback monogram by company ID using the geometric manifest regardless of the selected logo set. When the geometric manifest entry has no monogram, the resolver SHALL derive up to two letters from the corresponding catalog company name when available.

#### Scenario: Fallback under either logo set
- **WHEN** a company has a geometric-manifest monogram and either logo set is selected
- **THEN** the resolver supplies that geometric monogram

#### Scenario: Missing geometric monogram
- **WHEN** a catalog company has no geometric-manifest monogram
- **THEN** the resolver supplies up to two letters derived from its catalog name

### Requirement: Brand logo file size

Every light and dark SVG in the brand logo set served by the client SHALL be
no larger than 20,000 bytes unless it is recorded as an explicit exception in
`docs/efforts/visual-design/logo-exceptions.md`. An exception SHALL retain the original or
the smallest candidate that passes the approved visual tolerance, and SHALL
include raw and gzip byte sizes and the reason it remains oversized.

#### Scenario: Logo size limit

- **WHEN** the production client build emits the brand light and dark logo sets
- **THEN** every logo file SHALL be at most 20,000 bytes or be listed as an explicit, evidence-backed exception

### Requirement: Brand logo rendered fidelity

Optimization SHALL preserve the rendered appearance within this tolerance:
at both 512x512 and 1024x1024 RGBA raster sizes, no more than 0.5% of pixels
may have a maximum channel delta greater than 16/255, and no pixel may have a
maximum channel delta greater than 64/255. Every changed file SHALL have a
side-by-side PNG comparison.

#### Scenario: Compare an optimized logo

- **WHEN** a brand logo file is changed
- **THEN** its 512x512 and 1024x1024 raster comparisons SHALL meet the tolerance and have a side-by-side PNG in task evidence
