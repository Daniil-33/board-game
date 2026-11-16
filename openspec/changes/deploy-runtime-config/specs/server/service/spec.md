## ADDED Requirements

### Requirement: Browser origin configuration
The service SHALL read `ALLOWED_ORIGINS` as comma-separated exact HTTP(S) origins without credentials, paths, queries or fragments. Invalid entries SHALL fail startup naming `ALLOWED_ORIGINS`. Unset or empty configuration SHALL disable origin enforcement and CORS headers, preserving existing behaviour.

#### Scenario: Valid list
- **WHEN** configured with `https://stage.focusima.space,http://localhost:5173`
- **THEN** both exact origins SHALL be allowed

#### Scenario: Invalid entry
- **WHEN** an entry contains a path, credentials, query, fragment or is not an HTTP(S) origin
- **THEN** startup SHALL fail naming `ALLOWED_ORIGINS`

#### Scenario: Default compatibility
- **WHEN** `ALLOWED_ORIGINS` is unset or empty
- **THEN** API responses SHALL have no CORS headers and WebSocket connections SHALL retain existing origin-independent acceptance

### Requirement: API CORS grants
With configured origins the service SHALL grant CORS on `/api/*` only to matching origins, allow GET and POST with Authorization and Content-Type in preflights, and omit credential grants. Foreign origins SHALL receive no CORS grant. Responses SHALL vary by Origin.

#### Scenario: Allowed request and preflight
- **WHEN** a configured origin sends an API request or GET/POST preflight with Authorization and Content-Type
- **THEN** the response SHALL grant that exact origin and the preflight SHALL allow those methods and headers without credentials

#### Scenario: Foreign origin
- **WHEN** an unlisted origin sends an API request or preflight
- **THEN** the response SHALL omit Access-Control-Allow-Origin

### Requirement: WebSocket origin gate
With configured origins the service SHALL reject `/ws` upgrades with an absent or unlisted Origin using HTTP 403 before upgrade, without a 101 response or WebSocket frame. Matching origins SHALL proceed through the existing handshake and authentication.

#### Scenario: Rejected upgrade
- **WHEN** a WebSocket upgrade has an absent or foreign Origin and the list is configured
- **THEN** the server SHALL answer HTTP 403 before upgrading

#### Scenario: Accepted upgrade
- **WHEN** the upgrade Origin exactly matches a configured origin
- **THEN** the connection SHALL upgrade and use the existing protocol handshake

### Requirement: Version health endpoint
After startup migrations and room restoration the service SHALL serve unauthenticated `GET /api/health` with HTTP 200 and JSON `{"status":"ok","sha":"<GIT_SHA>"}`. The SHA SHALL come from environment `GIT_SHA`, defaulting to `unknown` when absent.

#### Scenario: Versioned server
- **WHEN** a running service has `GIT_SHA=abc123`
- **THEN** health SHALL return HTTP 200 with status `ok` and sha `abc123` without authentication

#### Scenario: Unversioned server
- **WHEN** a running service has no `GIT_SHA`
- **THEN** health SHALL return status `ok` and sha `unknown`
