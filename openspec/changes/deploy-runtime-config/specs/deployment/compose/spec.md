## ADDED Requirements

### Requirement: Web container runtime configuration
At container startup the web service SHALL generate `/config.js` exposing only `API_ORIGIN`, validated against `^https?://[a-z0-9.-]+(:[0-9]{1,5})?$` (or empty) in a shell entrypoint script without adding a Node runtime. This whitelist SHALL provide JavaScript and HTML safety without escaping. Invalid input SHALL fail startup naming `API_ORIGIN`. Empty or absent input SHALL select same-origin operation.

#### Scenario: Configured startup
- **WHEN** the web container starts with a valid `API_ORIGIN`
- **THEN** `/config.js` SHALL safely convey that origin before the application starts and SHALL expose no other environment variables

#### Scenario: Invalid input
- **WHEN** `API_ORIGIN` contains a path, credentials, query, fragment or executable injection payload
- **THEN** startup SHALL fail naming `API_ORIGIN` without executing that payload

#### Scenario: Local default
- **WHEN** the web container starts without `API_ORIGIN` or with an empty value
- **THEN** the client SHALL continue using same-origin API and socket URLs

### Requirement: Build version plumbing
Both Dockerfiles SHALL accept build argument `GIT_SHA` defaulting to `unknown`. The server SHALL receive it as runtime environment and the client SHALL serve it in `/version.txt`. Local Compose SHALL pass the build argument to both services with default `unknown` and SHALL preserve existing local, preview and e2e operation without new required variables.

#### Scenario: Identifiable build
- **WHEN** both images are built with `GIT_SHA=abc123`
- **THEN** server health and client `/version.txt` SHALL identify `abc123`

#### Scenario: Default build
- **WHEN** Compose builds without `GIT_SHA`
- **THEN** both versions SHALL identify `unknown` and the same-origin game SHALL remain playable

### Requirement: Client delivery cache policy
The web service SHALL serve `/index.html`, `/config.js` and `/version.txt` with `Cache-Control: no-cache`, including HTML served through SPA fallback. Hashed assets SHALL remain cacheable.

#### Scenario: Fresh configuration and version
- **WHEN** a browser requests HTML, runtime configuration or version
- **THEN** the response SHALL require cache revalidation

#### Scenario: Hashed asset
- **WHEN** a browser requests a hashed build asset
- **THEN** the response SHALL permit caching
