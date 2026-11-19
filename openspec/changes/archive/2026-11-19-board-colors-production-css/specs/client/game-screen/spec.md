## MODIFIED Requirements

### Requirement: Generated board

The board SHALL render all 40 projected cells in CLASSIC_40 order, with theme group strips and surface-appropriate logos for assets. It SHALL distinguish Start, Jail, Casino, Go to jail and Chance per the design. Player colors SHALL remain stable and same-cell tokens SHALL occupy separate slots. Group and special-cell gradients SHALL render from the shared theme colors in development and production builds, including when CSS minification emits hex colors.

#### Scenario: Board contents

- **WHEN** a readable-size board is built for a view with three players
- **THEN** it SHALL contain the 40 cells, jail box and three tokens, show projected prices on their group strips, and shorten company names to fit their measured widths

#### Scenario: Group distinction

- **WHEN** a board displays groups M1 through M8, logistics and energy
- **THEN** each group uses its distinct theme gradient consistently

#### Scenario: Production CSS colors

- **WHEN** the production board renders group strips and special cells from minified CSS theme tokens
- **THEN** each gradient SHALL contain its two theme colors and SHALL NOT fall back to the generic inset or cell color

#### Scenario: Missing or failed logo

- **WHEN** an asset has no matching logo URL or its texture fails to load
- **THEN** the cell displays the resolved monogram on the group gradient

#### Scenario: Compact board

- **WHEN** the board renders at a 360–430 px viewport width
- **THEN** it fits the available width and compact asset cells retain their strip, logo or monogram and projected markers with text hidden

#### Scenario: Elimination during animation

- **WHEN** an elimination update arrives while the player's movement is queued
- **THEN** the eliminated player's token SHALL be hidden and queued motion SHALL NOT restore it

#### Scenario: Authoritative snap on elimination or game finish

- **WHEN** an authoritative elimination or finished update arrives
- **THEN** the board SHALL cancel obsolete animations before snapping to the projection
