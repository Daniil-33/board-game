## ADDED Requirements

### Requirement: Public debt settlement events
LiquidationApplied and PlayerBankrupt SHALL be classified public and exported as core event contracts. Every viewer, including eliminated players and spectators, SHALL receive detached full payloads in event order, together with automatic mortgage and house sale events, balance changes and the enriched game end result.

#### Scenario: Liquidation and bankruptcy visible to all
- **WHEN** liquidation or bankruptcy events are projected for a player, eliminated player or spectator
- **THEN** all SHALL receive equal ordered payloads, and mutating a projected payload SHALL not change authoritative events
