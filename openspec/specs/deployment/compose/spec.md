# deployment/compose Specification

## Purpose
Provide a repeatable single-node deployment that serves the complete game locally and preserves game storage across service restarts.

## Requirements

### Requirement: Single command startup
The documented Compose command SHALL build and start the client delivery service, authoritative server and PostgreSQL, apply migrations before accepting game traffic, and publish ports only on 127.0.0.1.

#### Scenario: Clean deployment
- **WHEN** the documented command runs from a clean checkout with the documented environment file
- **THEN** browsers on localhost can log in and play through the bundled client without a separate development server
- **AND** every published port binds only to 127.0.0.1

### Requirement: Compressed web text responses
The web container SHALL gzip HTML, JavaScript, CSS, SVG and JSON responses when the client accepts gzip and the response meets the configured minimum size. It SHALL emit `Vary: Accept-Encoding`, retain immutable caching on hashed `/assets/`, and leave already-compressed image formats uncompressed.

#### Scenario: Request compressed text assets
- **WHEN** a client requests an eligible HTML, JavaScript, CSS, SVG or JSON response with gzip accepted
- **THEN** the web container returns gzip encoded content and includes `Vary: Accept-Encoding`
- **AND** hashed assets retain immutable caching

#### Scenario: Request an already-compressed image
- **WHEN** a client requests a supported image format that is already compressed
- **THEN** the web container does not gzip encode the response

### Requirement: Persistent game storage
The stack SHALL preserve database data across server and stack restarts unless the operator explicitly deletes its storage.

#### Scenario: Restart during play
- **WHEN** the server container restarts during a game
- **THEN** clients reconnect to the restored game and can continue from persisted state with recomputed deadlines

### Requirement: Web container runtime configuration
At startup the web service SHALL generate `/config.js` exposing only `API_ORIGIN` and `logoSet`, using a shell script without a Node runtime. `API_ORIGIN` SHALL be empty or match `^https?://[a-z0-9.-]+(:[0-9]{1,5})?$`, with explicit ports numerically restricted to 1..65535. This whitelist provides JavaScript/HTML safety without escaping. Invalid input SHALL fail startup naming `API_ORIGIN`. Empty or absent input SHALL select same-origin operation.

#### Scenario: Configured startup
- **WHEN** the web container starts with a valid `API_ORIGIN`
- **THEN** `/config.js` SHALL safely convey that origin before the application starts and SHALL expose no other environment variables

#### Scenario: Invalid input
- **WHEN** `API_ORIGIN` contains a path, credentials, query, fragment or executable injection payload
- **THEN** startup SHALL fail naming `API_ORIGIN` without executing that payload

#### Scenario: Explicit port range
- **WHEN** `API_ORIGIN` specifies a port
- **THEN** ports `0` and `99999` SHALL fail startup naming `API_ORIGIN`, while valid ports such as `8443` SHALL be accepted

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
