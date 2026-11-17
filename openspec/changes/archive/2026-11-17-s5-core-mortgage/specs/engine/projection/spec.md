## ADDED Requirements

### Requirement: Public mortgages and results
Every viewer SHALL receive detached public mortgages with advance, lapsCompleted, remainingLaps = 8 - lapsCompleted and pending; eliminations and finishedAt SHALL be public. In finished, result SHALL contain winner, finishedAt, eliminations and finalBalances for every player. Outside finished result SHALL be null. RNG SHALL remain secret.

#### Scenario: Reload a result or mid-term mortgage
- **WHEN** a player, eliminated player or spectator projects restored state
- **THEN** all SHALL see identical detached mortgage terms and elimination records and the finished result when applicable

### Requirement: Public mortgage and asset release events
AssetMortgaged, AssetRedeemed, MortgageExpired, AssetsReleased and enriched GameEnded SHALL be public, with mortgage and redeem BalanceChanged reasons public. Event order SHALL remain unchanged and all returned data SHALL be detached.

#### Scenario: Project lifecycle events
- **WHEN** the mortgage, release and end events are projected for any viewer
- **THEN** the full event payloads SHALL be preserved in order without sharing mutable data with authoritative state
