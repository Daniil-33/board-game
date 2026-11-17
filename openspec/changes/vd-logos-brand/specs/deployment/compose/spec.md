## ADDED Requirements

### Requirement: Runtime logo set selection

The web container SHALL publish the logo set in runtime config and SHALL accept brand or geometric through LOGO_SET. Brand SHALL be the default in all environments.

#### Scenario: Operator selects geometric

- **WHEN** the web container starts with LOGO_SET set to geometric
- **THEN** its config.js declares the geometric set without an image rebuild

### Requirement: Compressed SVG delivery

The web container SHALL gzip hashed SVG assets for clients that accept gzip and SHALL retain their immutable caching policy.

#### Scenario: Request a compressed logo

- **WHEN** a client requests a hashed logo SVG with gzip support
- **THEN** the response is gzip encoded and has an immutable Cache-Control header
