# server/recovery Specification

## Purpose
Defines recovery behavior for active stage 6 decisions and state upgrades.

## ADDED Requirements

### Requirement: Restore stage 6 state
Server recovery SHALL restore a prisoner with attempts, an open casino decision, a chance-loss bank charge, and a mortgage redeem lock with exact state and deadlines. The load path SHALL upgrade `core-8` snapshots to `core-9` before replay, and the upgrade SHALL not require a version literal in the server.

#### Scenario: Core-8 snapshot restores as core-9
- **WHEN** a core-8 snapshot is loaded
- **THEN** the recovered room SHALL use core-9, retain jail attempts and expose neutral casino state

### Requirement: Preserve genesis and divergence evidence
`upgradeState` SHALL leave genesis unchanged so shutdown followed by restore produces state equal to genesis. A divergence test SHALL prove the logged failed room, `tailIndex: 1`, and `errorCode: 'REDEEM_LOCKED'` without changing stored rows.

#### Scenario: Genesis room shutdown and restore
- **WHEN** a genesis room is shut down and restored
- **THEN** its recovered state SHALL equal genesis
