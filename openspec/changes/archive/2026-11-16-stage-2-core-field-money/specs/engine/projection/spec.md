## MODIFIED Requirements

### Requirement: State projection hides secrets
Projecting a game state for any viewer SHALL return a view that contains no RNG state, in any phase. Every other field of the current state (revision, rules version, phase, players, order-roll state, turn order, current turn, positions, interim jail entries, eliminated ids, winner, board, economy and balances) SHALL be present in the view with the same value as in the state.

#### Scenario: RNG never projected
- **WHEN** a state in phase `lobby`, `setup`, `playing` or `finished` is projected for a player viewer and for a spectator viewer
- **THEN** neither view SHALL contain the RNG state or any of its words

#### Scenario: Public fields projected
- **WHEN** a state is projected for any viewer
- **THEN** the view SHALL carry the state's revision, rules version, phase, players, order-roll state, turn order, current turn, positions, jail entries, eliminated ids, winner, board, economy and balances unchanged

### Requirement: Event projection fails closed
Projecting events for a viewer SHALL keep their order and return each event the viewer may see. BoardGenerated and BalanceChanged and every lifecycle event (`GameCreated`, `PlayerAdded`, `GameStarted`) and every order-roll, turn, interim-jail, leave, resignation and game-end event SHALL be visible to every viewer unchanged. An event whose type has no visibility classification SHALL raise an engine-defect error rather than be passed through.

#### Scenario: Lifecycle events are public
- **WHEN** the events of `CreateGame`, `AddPlayer` and `StartGame` are projected for a spectator viewer
- **THEN** the projected list SHALL be deep-equal to the original events, in the same order

#### Scenario: Turn events are public
- **WHEN** the events of a seeded game through setup and several turns are projected for a spectator viewer
- **THEN** every projected list SHALL be deep-equal to the original events

#### Scenario: Unknown event type
- **WHEN** an event list containing an event type with no visibility classification is projected
- **THEN** projection SHALL raise an error naming that event type and return no list

#### Scenario: Resignation and victory visible to everyone
- **WHEN** PlayerLeftLobby, PlayerResigned and GameEnded events are projected for participants, eliminated participants and spectators
- **THEN** every projected list SHALL preserve the original events and their object payloads in order
