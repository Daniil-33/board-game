# Spec Delta

## Purpose

Defines how the server process is configured, started and stopped.

## ADDED Requirements

### Requirement: Configuration and bind address
The service SHALL read `DATABASE_URL` (required), `HOST` (default
`127.0.0.1`) and `PORT` (default `8787`) from the environment. Without
`DATABASE_URL` it SHALL exit with a non-zero code and a message naming the
variable.

#### Scenario: Default bind
- **WHEN** the service starts without `HOST`
- **THEN** it SHALL listen on `127.0.0.1` only

### Requirement: Start and stop
On start the service SHALL apply pending migrations, restore every active
room, then listen. On SIGINT or SIGTERM it SHALL stop accepting connections,
close sockets, shut the room manager down (snapshots) and close the database
pool, then exit 0.

#### Scenario: Restart keeps games
- **WHEN** the service is stopped mid-game and started again
- **THEN** the game SHALL continue from its last accepted revision
