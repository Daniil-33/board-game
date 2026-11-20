# Spec Delta

## MODIFIED Requirements

### Requirement: Mortgage state
State SHALL contain mortgages keyed by asset id, each with advance, lapsCompleted, pending and lockedTurnId. lockedTurnId SHALL be a turn id or null. isMortgaged SHALL test own-key presence. Advance SHALL equal Q(50% price), lapsCompleted SHALL be an integer 0..7 and pending SHALL contain unique active order members. Mortgages SHALL belong to active owners and have no houses.

#### Scenario: Genesis and validity
- **WHEN** a game is created or restored
- **THEN** mortgages SHALL start empty or pass these invariants, and invalid mortgage state SHALL raise an invariant violation

#### Scenario: Legacy mortgage upgrade
- **WHEN** a core-7 mortgage is upgraded to core-8
- **THEN** its terms SHALL be preserved and lockedTurnId SHALL be null

### Requirement: Redemption
Redeem SHALL require no purchase, rent or charge, actor ownership, an existing mortgage and enough cash. Failures SHALL return DECISION_PENDING, RENT_PENDING, PAYMENT_PENDING, NOT_AN_ASSET, NOT_OWNER, NOT_MORTGAGED, REDEEM_LOCKED or INSUFFICIENT_FUNDS by precedence. A mortgage created this turn SHALL be locked. Success SHALL debit its stored advance, remove it and emit AssetRedeemed.

#### Scenario: Redeem or reject during rent
- **WHEN** an owner redeems with enough money outside rent, or attempts redemption during rent
- **THEN** redemption SHALL restore rent eligibility in the first case and reject RENT_PENDING without mutation in the second

#### Scenario: Same-turn mortgage lock
- **WHEN** an owner tries to redeem a mortgage whose lockedTurnId matches the current turnId
- **THEN** it SHALL reject with REDEEM_LOCKED without mutation

#### Scenario: Next regular or bonus turn
- **WHEN** the owner reaches a later turn with a different turnId, including a bonus turn after a double
- **THEN** redemption SHALL be allowed when its other requirements pass

#### Scenario: Mortgage created by liquidation
- **WHEN** a debt liquidation creates a mortgage during a turn
- **THEN** that mortgage SHALL carry the current turnId and SHALL be redeemable on the owner's next turn
