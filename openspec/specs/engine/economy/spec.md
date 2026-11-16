# engine/economy Specification

## Purpose

Defines public player money, deterministic initial funding and forward crossing rewards, with exact integer arithmetic and balance invariants.

## Requirements

### Requirement: Starting capital and fixed economy
StartGame SHALL fix economy.startingCapital to 10 × floor(600 × 56740 / (569 × N × 10)) and economy.lapReward to 10 × floor(2 × startingCapital / 150), using exact integer arithmetic. Each participant SHALL receive that capital. Before StartGame economy SHALL be null and balances empty.

#### Scenario: All supported player counts
- **WHEN** N is respectively 2,3,4,5,6 at StartGame
- **THEN** capital SHALL be respectively 29910,19940,14950,11960,9970 and reward 3980,2650,1990,1590,1320

#### Scenario: Lobby membership changes
- **WHEN** a player leaves before StartGame
- **THEN** the actual remaining participant count SHALL determine the economy

### Requirement: Every balance change emits an event
Each balance change SHALL emit public BalanceChanged { playerId, delta, balance, reason }; stage 2 reasons SHALL be starting-capital and lap-reward. StartGame events SHALL be GameStarted, one BalanceChanged per player in join order, then the existing order-roll events.

#### Scenario: Initial credits
- **WHEN** a two-player game starts
- **THEN** two starting-capital events SHALL report delta and balance 29910 in join order before OrderRollStarted

### Requirement: Forward crossing reward
Normal forward movement crossing or landing on cell zero SHALL credit the fixed lap reward once, immediately after PlayerMoved and before landing settlement. Third-double transfer to jail SHALL pay nothing. Interim jail release SHALL use normal movement; no landing cell SHALL otherwise change money in stage 2.

#### Scenario: Crossing and exact landing
- **WHEN** a player moves forward from 39 by 2, from 35 by 5, or from 30 by 12
- **THEN** one lap-reward event SHALL follow PlayerMoved and the resulting balance SHALL increase by economy.lapReward

#### Scenario: Third double and interim release
- **WHEN** a third consecutive double sends a player to jail, or a player moves from jail at 10 by at most 12
- **THEN** no lap-reward event SHALL be emitted

### Requirement: Balance invariant
Every balance SHALL be a non-negative safe integer multiple of 10. Keys SHALL be exactly all participants, including eliminated players, in setup, playing and finished, and empty before. Economy SHALL be present exactly when balances are non-empty. Violations SHALL raise InvariantViolationError named balances.

#### Scenario: Invalid money
- **WHEN** a balance is negative, fractional, unsafe or not a multiple of 10, or a balance key is missing or extra
- **THEN** invariant checking SHALL raise balances

#### Scenario: Resignation preserves money
- **WHEN** a participant resigns
- **THEN** their balance SHALL remain recorded unchanged with no BalanceChanged event
