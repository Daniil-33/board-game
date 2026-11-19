## MODIFIED Requirements

### Requirement: Intents only
Commands SHALL contain t, commandId, type, expected and payload, without actor. The payload SHALL be null except where the protocol defines one: BuildHouse, SellHouse, Mortgage and Redeem SHALL carry `{ assetId }`. Existing roll/end-turn commands SHALL retain target expectations. Resign SHALL use a revision expectation from the latest checked frame revision. The client SHALL NOT compute elimination, winners, rent payments, house changes or other game outcomes.

#### Scenario: Resign outside own turn
- **WHEN** a connected active player confirms resignation in setup or play
- **THEN** Resign SHALL carry the current revision expectation, irrespective of turn ownership or deadline

#### Scenario: Roll dice frame
- **WHEN** the active player presses Roll in turn `t7`
- **THEN** the frame SHALL be `{ t: 'Command', commandId, type: 'RollDice', expected: { kind: 'target', target: { kind: 'turn', id: 't7' } }, payload: null }` and SHALL pass `decodeClientFrame`

#### Scenario: Build house frame
- **WHEN** the active player presses Build on asset `a12` in turn `t7`
- **THEN** the frame SHALL be `{ t: 'Command', commandId, type: 'BuildHouse', expected: { kind: 'target', target: { kind: 'turn', id: 't7' } }, payload: { assetId: 'a12' } }` and SHALL pass `decodeClientFrame`

#### Scenario: Mortgage and redeem frames
- **WHEN** the viewer selects Mortgage or Redeem on asset a12 in turn t7
- **THEN** the command SHALL carry its selected type, payload `{ assetId: 'a12' }` and target `{ kind: 'turn', id: 't7' }` and pass decodeClientFrame

#### Scenario: Rejected or accepted mortgage command
- **WHEN** an Ack rejects or accepts Mortgage or Redeem
- **THEN** a rejection SHALL show its client-translated title and reason without the code or server message, keep the code in `data-code`, and neither outcome SHALL change the projected mortgage, balance or rent locally

### Requirement: Acknowledgements
A sent command SHALL stay pending until its `Ack` arrives. A rejected `Ack` SHALL show its client-translated action title and translated reason to the player, without protocol codes or server-provided messages in visible text. When no translated reason exists, it SHALL show a translated retry prompt. The code SHALL remain available in `data-code`. An accepted `Ack` SHALL NOT change the view by itself.

#### Scenario: Rejected command
- **WHEN** `Ack { outcome: 'rejected', error: { code: 'DEADLINE_PASSED', message } }` arrives for a pending command
- **THEN** the command SHALL no longer be pending and the HUD SHALL show its client-translated title and reason without the code or server message
