## ADDED Requirements

### Requirement: Public rent and houses
Every viewer SHALL receive detached houses, rent and rentQuotes along with all balances. Each owned asset SHALL have a quote: {kind: 'fixed', amount} or {kind: 'energy', sumPrices, groupSize, holdings}. Resigned owners and mortgaged assets SHALL quote fixed zero. rentFor and energyRentFor SHALL be exported pure display helpers.

#### Scenario: Energy quote
- **WHEN** an active owner has a non-mortgaged energy asset
- **THEN** its quote SHALL contain exact sumPrices, groupSize and non-mortgaged holdings, and energyRentFor(quote,diceSum) SHALL reproduce landing rent

#### Scenario: Detached public data
- **WHEN** a player, spectator or eliminated participant projects state and changes the returned data
- **THEN** all SHALL originally see identical houses, rent and quotes and authoritative state SHALL remain unchanged

### Requirement: Rent and house events are public
RentDue, RentPaid, HouseBuilt and HouseSold, and BalanceChanged with reasons rent, build and house-sale SHALL be visible unchanged to every viewer in event order.

#### Scenario: Settlement and construction events
- **WHEN** any new rent or house event is projected
- **THEN** all viewers SHALL receive detached copies in the original order
