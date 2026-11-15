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

### Requirement: Persistent game storage
The stack SHALL preserve database data across server and stack restarts unless the operator explicitly deletes its storage.

#### Scenario: Restart during play
- **WHEN** the server container restarts during a game
- **THEN** clients reconnect to the restored game and can continue from persisted state with recomputed deadlines
