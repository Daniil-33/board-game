## MODIFIED Requirements

### Requirement: Generated board

The board SHALL render all 40 projected cells in CLASSIC_40 order. Asset cells SHALL display a theme gradient strip for their group and use the logo variant appropriate to the cell surface. Missing or failed logos SHALL display the resolved monogram on the group gradient. At readable sizes the cells SHALL display the projected price on the strip and shorten the company name to fit its measured width. The board SHALL distinguish Start, Jail, Casino, Go to jail and Chance per the design. At 360–430 px viewport widths the board SHALL fit the available width, and compact asset cells SHALL retain their strip, logo or monogram and projected markers with name and price text hidden. Player colors SHALL remain stable and same-cell tokens SHALL occupy separate slots. Eliminated tokens SHALL be hidden, and authoritative elimination and finished updates SHALL cancel obsolete animations before snapping to the projection.

#### Scenario: Board contents
- **WHEN** a readable-size board is built for a view with three players
- **THEN** it contains the 40 cells, jail box and three tokens, with measured company names, prices and group strips on asset cells

#### Scenario: Group distinction
- **WHEN** a board displays groups M1 through M8, logistics and energy
- **THEN** each group uses its distinct theme gradient consistently

#### Scenario: Missing or failed logo
- **WHEN** an asset has no matching logo URL or its texture fails to load
- **THEN** the cell displays the resolved monogram on the group gradient

#### Scenario: Compact board
- **WHEN** the board renders at a 360–430 px viewport width
- **THEN** it fits the available width and compact asset cells retain their strip, logo or monogram and projected markers with text hidden

#### Scenario: Elimination during animation
- **WHEN** an elimination update arrives while the player's movement is queued
- **THEN** that player's token disappears and queued motion cannot restore it

### Requirement: Animation follows events in order
The client SHALL animate authoritative Update events sequentially and synchronize tokens to the view when idle or receiving Welcome. Token movement and rent transfer SHALL shorten or skip their visual effects when the browser prefers reduced motion. The client SHALL apply authoritative state independently of animation playback.

#### Scenario: Animation detail contract
- **WHEN** this requirement is exercised
- **THEN** the following constraints SHALL hold:

Events of an `Update` SHALL be turned into animation steps and played one at
a time in the order received, across updates. `DiceRolled` and
`OrderDieRolled` SHALL show the rolled values from the event. `PlayerMoved`
SHALL move the token cell by cell from `from` through `steps` cells, wrapping
after cell 39. `SentToJail` SHALL move the token straight to the jail cell.
An unknown event type SHALL be skipped without error. When no animation is
running, and after every `Welcome`, tokens SHALL stand on the view's
positions.

#### Scenario: Roll then move
- **WHEN** an update carries `DiceRolled { dice: [3, 4] }` then `PlayerMoved { from: 38, to: 5, steps: 7 }`
- **THEN** the dice step SHALL finish before the token moves, and the token SHALL visit 39, 0, 1, 2, 3, 4, 5 in that order

#### Scenario: Two updates
- **WHEN** a second update arrives while the first one's steps are still playing
- **THEN** all steps of the first update SHALL play before any step of the second

#### Scenario: Third double
- **WHEN** an update carries `DiceRolled` then `SentToJail { from: 12, to: 10 }`
- **THEN** the token SHALL go to cell 10 without walking the ring

#### Scenario: Welcome during animation
- **WHEN** `Welcome` arrives while steps are waiting
- **THEN** the waiting steps SHALL be dropped and tokens SHALL stand on the `Welcome` view's positions

#### Scenario: Reduced motion
- **WHEN** a live update carries movement or rent events and reduced motion is requested
- **THEN** the respective visual effects are shortened or skipped and the current authoritative view is applied independently

### Requirement: Asset inspection
Clicking or tapping an asset cell SHALL open a Vue card showing its projected company name, category, group, monopoly rank when present, price, owner name or "free", and other group members with their prices and cell indices. A close control or Escape SHALL close the card. Clicking a non-asset cell SHALL open no card. The card SHALL use the current server board and view only; its actions SHALL be Build and Sell for the viewer's own monopoly assets and Mortgage and Redeem for any of the viewer's own assets.

#### Scenario: Monopoly details
- **WHEN** a player clicks a monopoly asset
- **THEN** its card SHALL show company, category, group, rank, price and all other assets with the same groupId and their prices and cells

#### Scenario: Logistics and energy details
- **WHEN** a logistics or energy asset is selected
- **THEN** its card SHALL show its projected category, group, price, owner name or "free", and other group members without inventing a monopoly rank

#### Scenario: Dismiss card
- **WHEN** an open card receives Escape or its close control is clicked
- **THEN** the card SHALL close

#### Scenario: Special cell click
- **WHEN** no card is open and a non-asset cell is clicked
- **THEN** no card SHALL open

#### Scenario: Ownership changes
- **WHEN** a new view assigns the selected asset an owner
- **THEN** the open card SHALL display that owner from the current projection

#### Scenario: Desktop hover
- **WHEN** the pointer hovers over an asset cell on a hover-capable desktop
- **THEN** a tooltip shows the full company name and formatted projected price

### Requirement: Projected owner markers
Owned asset cells SHALL show a PixiJS border or ribbon in the owner's player colour, distinct from the group marker. Ownership SHALL come only from view.owners and SHALL refresh on each authoritative view independently of movement animations.

#### Scenario: Owner changes without board regeneration
- **WHEN** a new view changes ownership while the generated board stays identical
- **THEN** the cell marker SHALL refresh to the new owner's colour

### Requirement: House markers
Every asset cell SHALL show 1-4 PixiJS house pips equal to `view.houses` for that asset and none when absent. Markers SHALL refresh on each view independently of movement animations, like owner markers.

#### Scenario: Houses change without board regeneration
- **WHEN** a new view changes an asset's houses from 2 to 3
- **THEN** that cell SHALL show three markers

#### Scenario: Pips alongside asset details
- **WHEN** a readable-size asset cell shows house pips on any side of the board
- **THEN** the pips SHALL sit clear of the company name and price strip

### Requirement: Mortgage cell markers
Each asset in view.mortgages SHALL have a diagonal hatch and dimming. Each view SHALL refresh these independently of movement animations.

#### Scenario: Mortgage changes on the same board
- **WHEN** a new view adds or removes a mortgage without regenerating the board
- **THEN** the corresponding marker SHALL appear or disappear immediately
