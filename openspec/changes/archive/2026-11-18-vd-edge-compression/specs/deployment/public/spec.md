# Spec Delta

## MODIFIED Requirements

### Requirement: Public TLS edge
The public deployment SHALL publish only edge ports 80 and 443 and serve only focusima.space, api.focusima.space, stage.focusima.space and stage-api.focusima.space. HTTP SHALL serve ACME challenges and redirect other requests to HTTPS. HTTPS SHALL use HTTP/2 for browsers, HSTS and route each host to its environment. Access logs SHALL omit query strings. Text responses SHALL be gzip compressed when accepted and large enough to meet the configured minimum; already-compressed image formats SHALL not be recompressed. The edge SHALL use HTTP/1.1 to the web upstream.

#### Scenario: Public request routing
- **WHEN** a request arrives for one of the four configured hosts
- **THEN** HTTP serves its ACME challenge or redirects to HTTPS
- **AND** HTTPS routes web traffic to web and API /api/ and /ws traffic to server in the matching environment
- **AND** WebSocket upgrades support one-hour timeouts and logs contain paths without query strings

#### Scenario: Browser transport and web response compression
- **WHEN** a browser requests an eligible text response over HTTPS with gzip accepted
- **THEN** the browser connection uses HTTP/2 and the response has `Content-Encoding: gzip` and `Vary: Accept-Encoding`
- **AND** image formats that are already compressed are not gzip encoded
- **AND** the edge uses HTTP/1.1 for its web upstream request

#### Scenario: Environment absent
- **WHEN** an environment has no running app containers but its certificates exist
- **THEN** the edge starts and serves TLS with a 502 or maintenance response for that environment

## ADDED Requirements

### Requirement: Edge proxy compatibility
The public edge SHALL preserve HTTP API proxying and WebSocket upgrade behavior while serving web traffic over HTTP/2 to browsers.

#### Scenario: API and WebSocket through the edge
- **WHEN** a client sends an API request or a valid WebSocket upgrade through the corresponding public host
- **THEN** the request reaches the matching server upstream and the WebSocket receives an upgrade response
