## MODIFIED Requirements

### Requirement: Free asset landing decision
Landing on a free monopoly, logistics or energy asset SHALL offer purchase to the landing player after movement and any lap reward, including jail release. Purchase and auction SHALL be mutually exclusive. An owned asset SHALL have no landing effect.

#### Scenario: Lap reward before offer
- **WHEN** a player moves and crosses start before landing on a free asset
- **THEN** PurchaseOffered SHALL follow PlayerMoved and the lap-reward BalanceChanged

#### Scenario: Owned asset or jail release
- **WHEN** movement lands on an owned asset or a jail release lands on a free asset
- **THEN** the former SHALL create no decision and the latter SHALL create a purchase decision
