# engine/projection Specification

## Purpose
Defines public visibility for the casino decision and stage 6 events.

## ADDED Requirements

### Requirement: Casino and special-cell events are public
`StateView` SHALL include public casino state. `CasinoOffered`, `CasinoResolved`, `CasinoDeclined`, `ChanceDrawn`, `JailAttemptFailed` and `JailReleased` SHALL be classified public, detached and preserved in event order for every viewer.

#### Scenario: Spectator sees special-cell state and events
- **WHEN** a spectator projects a state with an open casino decision and its events
- **THEN** the view SHALL contain the decision and the event list SHALL preserve all classified public events in order
