# Spec Delta

## RENAMED Requirements

- FROM: `### Requirement: Placeholder board`
- TO: `### Requirement: Generated board`

## MODIFIED Requirements

### Requirement: Generated board
The board SHALL render all 40 projected cells with company names for assets and Start, Jail, Casino, Go to jail or Chance for other cells. Assets SHALL show projected prices and distinct markers per groupId; long names SHALL wrap or truncate legibly. No placeholder marker SHALL remain. Player colors SHALL remain stable. Eliminated tokens SHALL be hidden; authoritative elimination and finished updates SHALL cancel obsolete animations before snapping to the projection.

#### Scenario: Elimination during animation
- **WHEN** an elimination update arrives while the player's movement is queued
- **THEN** that player's token SHALL disappear and queued motion SHALL NOT restore it

#### Scenario: Board contents
- **WHEN** the board is built for a view with three players
- **THEN** it SHALL contain the 40 projected cells, a jail box marker and three tokens, with asset names, prices and group markers and no placeholder caption

#### Scenario: Group distinction
- **WHEN** a generated board contains M1 through M8, logistics and energy
- **THEN** every group SHALL have a distinct marker used consistently across its cells

## ADDED Requirements

### Requirement: Public player balances
A player panel SHALL show every participant's nickname, projected balance, active-turn mark and eliminated mark. Each new server view SHALL refresh balances, including lap rewards. The production client SHALL NOT calculate prices, capital or rewards.

#### Scenario: Lap reward update
- **WHEN** an Update supplies a new balance after a lap reward
- **THEN** the panel SHALL display the supplied balance immediately, independently of queued movement animation

#### Scenario: Eliminated participant remains visible
- **WHEN** an eliminated participant is absent from the active turn order
- **THEN** the panel SHALL retain their nickname, projected balance and eliminated mark

### Requirement: Asset inspection
Clicking an asset cell SHALL open a Vue card showing its projected company name, category, group, monopoly rank when present, price and other group members with their prices and cell indices. A close control or Escape SHALL close the card. Clicking a non-asset cell SHALL open no card. The card SHALL use the current server board only and SHALL offer no asset actions.

#### Scenario: Monopoly details
- **WHEN** a player clicks a monopoly asset
- **THEN** its card SHALL show company, category, group, rank, price and all other assets with the same groupId and their prices and cells

#### Scenario: Logistics and energy details
- **WHEN** a logistics or energy asset is selected
- **THEN** its card SHALL show its projected category, group, price and other group members without inventing a monopoly rank

#### Scenario: Dismiss card
- **WHEN** an open card receives Escape or its close control is clicked
- **THEN** the card SHALL close

#### Scenario: Special cell click
- **WHEN** no card is open and a non-asset cell is clicked
- **THEN** no card SHALL open
