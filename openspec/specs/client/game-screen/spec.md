# client/game-screen Specification

## Purpose
Defines what the game screen shows from the server's view: the Vue HUD (turn
order, active player, timer, actions) and the PixiJS board (placeholder ring,
tokens, dice and movement animation).

## Requirements

### Requirement: Turn order and active player
The HUD SHALL retain existing active order/setup display and additionally show
eliminated participants with explicit out markers even when absent from active
order/groups. Names SHALL come from the refreshed member map.

#### Scenario: Eliminated participant
- **WHEN** a player appears in view.eliminated but no longer in view.order
- **THEN** the HUD SHALL still identify that player as out

#### Scenario: Playing
- **WHEN** the view has `order: [b, a, c]` and `turn.playerId: a`
- **THEN** the HUD SHALL list b, a, c in that order with a marked active

#### Scenario: Setup tie
- **WHEN** the view has `setup.groups: [[c], [a, b]]`
- **THEN** the HUD SHALL list c first and SHALL mark a and b as tied

### Requirement: Timer from the server deadline
While `turn.pausedRemainingMs` is non-null the turn timer SHALL show "paused". Otherwise the timer SHALL show the time left until the view's deadline
(`setup.deadline` in phase `setup`, `turn.deadline` in phase `playing`),
computed as the deadline minus the current time and never below zero. It
SHALL NOT count down from a local fixed duration. When the view's deadline
changes the timer SHALL follow it.

#### Scenario: Mid-turn reconnect
- **WHEN** a view arrives whose turn deadline is 12 400 ms after the current time
- **THEN** the timer SHALL show 13 s, not 45 s

#### Scenario: Continuation
- **WHEN** an update replaces the turn deadline with one 20 000 ms ahead
- **THEN** the timer SHALL show 20 s

#### Scenario: Past deadline
- **WHEN** the current time is after the deadline
- **THEN** the timer SHALL show 0 s

#### Scenario: Paused turn
- **WHEN** the view supplies a non-null paused remainder during an auction
- **THEN** the turn timer SHALL show "paused", regardless of the old deadline

### Requirement: Action buttons follow the view
`RollForOrder` SHALL require setup and the viewer as `setup.playerId`.
`RollDice` SHALL require playing, the viewer as turn owner and `rolled: false`;
`EndTurn` SHALL require playing, the viewer as turn owner and `rolled: true`.
RollDice and EndTurn SHALL be disabled during auctions. Buttons SHALL be
disabled while disconnected, while their command type is pending, and once
the server deadline has passed.

#### Scenario: Not my turn
- **WHEN** the view's `turn.playerId` is another player
- **THEN** RollDice and EndTurn SHALL be disabled

#### Scenario: Before and after the roll
- **WHEN** it is the viewer's turn with `rolled: false`, then with `rolled: true`
- **THEN** first only RollDice SHALL be enabled, then only EndTurn

#### Scenario: My order roll
- **WHEN** the phase is `setup` and `setup.playerId` is the viewer
- **THEN** only RollForOrder SHALL be enabled

#### Scenario: Pending command
- **WHEN** the viewer pressed RollDice and its `Ack` has not arrived
- **THEN** RollDice SHALL be disabled

#### Scenario: Auction in progress
- **WHEN** the turn owner views an ongoing auction
- **THEN** RollDice and EndTurn SHALL be disabled

### Requirement: Generated board

The board SHALL render all 40 projected cells in CLASSIC_40 order, with theme group strips and surface-appropriate logos for assets. It SHALL distinguish Start, Jail, Casino, Go to jail and Chance per the design. Player colors SHALL remain stable and same-cell tokens SHALL occupy separate slots.

#### Scenario: Board contents
- **WHEN** a readable-size board is built for a view with three players
- **THEN** it SHALL contain the 40 cells, jail box and three tokens, show projected prices on their group strips, and shorten company names to fit their measured widths

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
- **THEN** the eliminated player's token SHALL be hidden and queued motion SHALL NOT restore it

#### Scenario: Authoritative snap on elimination or game finish
- **WHEN** an authoritative elimination or finished update arrives
- **THEN** the board SHALL cancel obsolete animations before snapping to the projection

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

### Requirement: Confirmed resignation and spectator
Setup and play SHALL offer Resign to connected active participants, independent
of turn and deadline. Confirmation SHALL explain permanent elimination and
continued watching; Cancel SHALL send nothing; confirming SHALL send one Resign
intent, never twice while pending. Rejection SHALL be visible. Elimination SHALL
show only from the projection. An eliminated viewer SHALL stay connected, see
“You are out” with the projected reason and keep read-only viewing.

#### Scenario: Cancel
- **WHEN** the player cancels resignation confirmation
- **THEN** no Resign SHALL be sent and the screen SHALL keep following the view

#### Scenario: Three-player spectator
- **WHEN** the server eliminates the viewer while two others remain active
- **THEN** the viewer SHALL keep receiving the game and see their out status

#### Scenario: Bankruptcy spectator
- **WHEN** the viewer appears in view.eliminations with reason bankrupt
- **THEN** the elimination screen SHALL show bankrupt and keep the board and subsequent views available without enabled gameplay controls

### Requirement: Game over
Every viewer SHALL show a game-over screen on phase finished, rendering the winner, elimination order with reasons and times, and final balances from `view.result`, without game controls and offering return to lobby. This SHALL work from setup
without positions and from play, including for eliminated viewers. Returning
SHALL disconnect and clear the local room without sending pre-start Leave.

#### Scenario: Last opponent resigns
- **WHEN** a finished projection names the surviving winner
- **THEN** both clients SHALL show that winner and a return-to-lobby control

#### Scenario: Finish during setup
- **WHEN** finished arrives with no positions or turn
- **THEN** game over SHALL render without requiring a playing-state board

#### Scenario: Reload finished game
- **WHEN** a Welcome supplies a finished view after reload or remount
- **THEN** the screen SHALL show the same projected result without requiring GameEnded events

### Requirement: Public player balances
A player panel SHALL show every participant's nickname, projected balance, active-turn mark and eliminated mark. Each new server view SHALL refresh balances, including lap rewards. The production client SHALL NOT calculate prices, capital or rewards.

#### Scenario: Lap reward update
- **WHEN** an Update supplies a new balance after a lap reward
- **THEN** the panel SHALL display the supplied balance immediately, independently of queued movement animation

#### Scenario: Eliminated participant remains visible
- **WHEN** an eliminated participant is absent from the active turn order
- **THEN** the panel SHALL retain their nickname, projected balance and eliminated mark

### Requirement: Asset inspection
Clicking or tapping an asset cell SHALL open a Vue card that uses only the current server board and view.

#### Scenario: Card content
- **WHEN** an asset card opens
- **THEN** it SHALL show its projected company name, category, group, monopoly rank when present, price, owner name or "free", and other group members with their prices and cell indices

#### Scenario: Actions on owned assets
- **WHEN** the viewer opens their own asset card
- **THEN** it SHALL offer Mortgage and Redeem for the asset and Build and Sell for a monopoly asset. Cards for other assets SHALL omit these actions

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

### Requirement: Purchase decision display
While view.purchase exists, the landing viewer SHALL see a Vue dialog with asset, fixed price, own balance, Buy and Start auction. Buy SHALL be disabled below price. Other viewers SHALL see who is deciding. Controls SHALL require connection, an active viewer, an unexpired turn deadline and no same-type pending command.

#### Scenario: Affordable and unaffordable purchase
- **WHEN** the deciding viewer's balance is equal to the price or below it
- **THEN** Buy SHALL respectively be enabled or disabled and Start auction SHALL remain available subject to command availability

#### Scenario: Other viewer
- **WHEN** another participant or an eliminated viewer sees the pending decision
- **THEN** they SHALL see the deciding player's name without purchase controls

### Requirement: Auction participation display
While view.auction exists every viewer SHALL see asset, start bid, step, leading amount and leader, passed players, responder and responseDeadline minus current time in seconds rounded up and clamped at zero. Only the active responder SHALL get Bid and Pass controls, subject to connection, pending command and response deadline checks.

#### Scenario: Next bid and affordability
- **WHEN** the responder sees an auction with no leader or with a leading bid
- **THEN** Bid SHALL show startBid or leadingBid plus step respectively and SHALL be disabled when that amount exceeds their projected balance

#### Scenario: Other participants and spectators
- **WHEN** a non-responder or eliminated viewer sees the auction
- **THEN** the panel SHALL be read-only

#### Scenario: Resignation restores a leader
- **WHEN** an Update containing only PlayerResigned changes the projected leader, leading bid, responder or passed list
- **THEN** the panel SHALL display the new projection and next bid without deriving auction state from events

#### Scenario: Timeout and settlement
- **WHEN** the response deadline passes locally
- **THEN** the timer SHALL show zero without locally passing anyone or closing the auction; a later view SHALL determine the displayed outcome

### Requirement: Projected owner markers
Owned asset cells SHALL show a PixiJS border or ribbon in the owner's player colour, distinct from the group marker. Ownership SHALL come only from view.owners and SHALL refresh on each authoritative view independently of movement animations.

#### Scenario: Owner changes without board regeneration
- **WHEN** a new view changes ownership while the generated board stays identical
- **THEN** the cell marker SHALL refresh to the new owner's colour

### Requirement: Purchase and auction intents
Purchase and auction controls SHALL send null-payload intents through the existing protocol connection. Purchase intents SHALL target the projected turn; Bid and PassAuction SHALL target the projected auction responseId. Ack errors SHALL remain visible and accepted Acks SHALL NOT locally change ownership or settle an auction.

#### Scenario: Rejected stale bid
- **WHEN** the server rejects a bid with an Ack error
- **THEN** the error code and message SHALL be shown and the client SHALL retain the latest projected auction

### Requirement: Rent settlement display
While `view.rent` is non-null every viewer SHALL see the open settlement: payer name, owner name, asset name and amount, and for kind `energy` also the dice sum. When the viewer is the payer, the panel SHALL offer "Pay rent" labelled with the amount and the owner's name, enabled only while connected, the viewer is active, the turn deadline has not passed and no `PayRent` is pending. The client SHALL NOT compute the paid amount, a shortfall or balances; they come from later views.

#### Scenario: Payer sees the pay action
- **WHEN** the view's rent names the viewer as payer with amount 120 owed to Bob
- **THEN** the panel SHALL show a Pay rent control with 120 and Bob, and the settlement line

#### Scenario: Owner and spectators
- **WHEN** the owner, another participant, an eliminated player or a spectator sees the same view
- **THEN** each SHALL see the settlement line without a Pay rent control

#### Scenario: Energy settlement
- **WHEN** the open settlement has kind `energy` and dice sum 9
- **THEN** the line SHALL show the dice sum 9 together with the amount

#### Scenario: Settlement closed by a later view
- **WHEN** an accepted PayRent Ack arrives before the next Update
- **THEN** the panel SHALL remain until a view without `rent` arrives

### Requirement: Settlement does not block ending the turn
An open settlement SHALL NOT disable `EndTurn`. While a settlement is open and the viewer is the payer, the turn controls SHALL state that ending the turn pays the rent automatically.

#### Scenario: End turn with an open settlement
- **WHEN** the payer has rolled and the settlement is open
- **THEN** EndTurn SHALL be enabled and the automatic-payment note SHALL be visible

### Requirement: Houses and rent quote on the asset card
The asset card SHALL show the house count (0-4) from `view.houses` for monopoly assets and the current rent quote from `view.rentQuotes` for owned assets: a `fixed` quote as its amount, an `energy` quote as the formula with its `sumPrices`, `holdings` and `groupSize` and the rent for dice sums 2, 7 and 12 computed only with game-core `energyRentFor`. A free asset SHALL show no quote. An open card SHALL follow each new view.

#### Scenario: Regular, logistics and energy quotes
- **WHEN** the card shows an owned monopoly asset, an owned logistics asset and an owned energy asset
- **THEN** the first two SHALL show their fixed amounts and the energy asset SHALL show the formula and helper-computed examples

#### Scenario: House count updates
- **WHEN** a new view raises the selected asset's houses from 1 to 2
- **THEN** the open card SHALL show 2 houses and the new quote

### Requirement: Build and sell controls
For a monopoly asset owned by the viewer the asset card SHALL show Build and Sell controls; other viewers' assets and non-monopoly assets SHALL show none. Build SHALL show the house cost from game-core `houseCost(price)` and Sell the refund from `houseRefund(cost)`; the client SHALL NOT compute them otherwise. Each control SHALL be enabled only when game-core `buildLegality` / `saleLegality` on the current view returns no code and the connection checks pass.

#### Scenario: Legal build and sale
- **WHEN** the viewer owns a whole group with even houses, has the quota and the funds, and it is their turn
- **THEN** Build SHALL be enabled with its cost, and Sell SHALL be enabled with its refund on an asset holding the group maximum

#### Scenario: Not the owner
- **WHEN** the selected asset belongs to another player
- **THEN** the card SHALL show no Build or Sell control

### Requirement: Build quota display
While it is the viewer's turn, the controls SHALL show the builds left this turn from `view.turn.quotas.builds`. The client SHALL NOT compute or reset the quota; a bonus turn shows whatever the view projects.

#### Scenario: Quota used
- **WHEN** the view's turn quota shows zero builds after a build
- **THEN** the card SHALL show zero builds left and Build SHALL be disabled with the quota reason

### Requirement: Disabled control reasons
A disabled Build or Sell control SHALL show one reason text: the message mapped from the helper's `HouseErrorCode` (one message per code) or, when the helper allows it, the connection reason (disconnected, pending, deadline passed, not an active player).

#### Scenario: Each reason
- **WHEN** a helper returns any `HouseErrorCode`
- **THEN** the corresponding control SHALL be disabled and show that code's message

#### Scenario: Connection reason
- **WHEN** the helper allows a build but the client is disconnected
- **THEN** Build SHALL be disabled with the disconnected reason

### Requirement: Rent and building intents
`PayRent` SHALL be sent with payload `null`; `BuildHouse` and `SellHouse` with payload `{ assetId }` of the selected asset. All three SHALL target the projected turn. An accepted Ack SHALL NOT change houses, balances or the settlement locally.

#### Scenario: Accepted build
- **WHEN** the server accepts BuildHouse before the next Update
- **THEN** houses, balances and the settlement SHALL stay as last projected

### Requirement: Rejected house command reasons
A rejected Ack SHALL show its code and message. For a rejected `BuildHouse` or `SellHouse` with a `HouseErrorCode` it SHALL also show the mapped reason text; other commands sharing a code SHALL show no house reason.

#### Scenario: Illegal build rejected
- **WHEN** the server rejects BuildHouse with `UNEVEN_BUILD`
- **THEN** the HUD SHALL show the code, message and the uneven-build reason, and the view SHALL stay as last projected

#### Scenario: Shared code on another command
- **WHEN** the server rejects BuyAsset or Bid with `INSUFFICIENT_FUNDS`
- **THEN** the HUD SHALL show the code and message without a house reason

### Requirement: House markers
Every asset cell SHALL show 1-4 PixiJS house pips equal to `view.houses` for that asset and none when absent. Markers SHALL refresh on each view independently of movement animations, like owner markers.

#### Scenario: Houses change without board regeneration
- **WHEN** a new view changes an asset's houses from 2 to 3
- **THEN** that cell SHALL show three markers

### Requirement: Rent payment animation
A `RentPaid` event in an `Update` with `amount > 0` SHALL queue one step that shows the paid amount moving from the payer's token to the owner's token, in event order with other steps. Houses, mortgages, balances and the settlement SHALL render from the view independently of event notices. A `Welcome` SHALL queue no rent animation, so a reload skips it. A malformed `RentPaid` payload SHALL yield no step.

#### Scenario: New payment
- **WHEN** an Update carries `RentPaid { payerId: A, ownerId: B, amount: 120 }`
- **THEN** one rent payment step from A to B with amount 120 SHALL be queued

#### Scenario: Reload
- **WHEN** a Welcome arrives whose view follows a RentPaid
- **THEN** no rent payment step SHALL be queued

### Requirement: Mortgage controls
For the viewer's own assets the card SHALL offer Mortgage and Redeem, using game-core mortgageLegality and redeemLegality plus connection, pending and deadline checks. Labels SHALL show mortgageAdvance(price) and the stored redeem advance (or the helper advance when unmortgaged). Each disabled action SHALL show one mapped message per MortgageErrorCode, or the connection reason when legal.

#### Scenario: Own and other assets
- **WHEN** the selected asset belongs to the viewer or another player
- **THEN** Mortgage and Redeem SHALL respectively appear or be absent

#### Scenario: Every legality reason
- **WHEN** either helper returns any MortgageErrorCode
- **THEN** its action SHALL be disabled with that code's mapped message

#### Scenario: Rent remains open
- **WHEN** the viewer's own rent settlement is open
- **THEN** legal Mortgage and Sell SHALL remain available while Redeem and Build show RENT_PENDING

#### Scenario: Amount labels
- **WHEN** the asset is unmortgaged or mortgaged
- **THEN** the labels SHALL show the shared helper advance and the actual stored redemption amount respectively

### Requirement: Projected mortgage terms
A mortgaged asset card SHALL show mortgaged, remainingLaps and the names of pending players from view.mortgages. Its rent quote SHALL show projected zero rent. Terms and quotes SHALL refresh from each view without local lap counting.

#### Scenario: Term progresses or ends
- **WHEN** a view changes remainingLaps or pending, or removes the mortgage by redemption or expiry
- **THEN** the open card SHALL immediately show the current terms or remove the mortgage state

### Requirement: Public liquidation summary
Every viewer SHALL receive a summary of each LiquidationApplied: payer, creditor, debt, ordered steps with tier, kind, asset and amount, total raised and payment. Payment SHALL use the matching RentPaid event in that update. Summaries SHALL be independent of the animation queue and SHALL NOT compute game outcomes.

#### Scenario: All tiers and kinds
- **WHEN** an update contains tier 1 and 2 mortgage steps and tier 3 sell-house and mortgage steps
- **THEN** all viewers SHALL see every step in event order and the event-provided raised and payment amounts

#### Scenario: Multiple updates
- **WHEN** another update arrives after a liquidation
- **THEN** the preceding summary SHALL remain available during that room session

### Requirement: Public bankruptcy notice
Every viewer SHALL see each PlayerBankrupt notice with player, creditor, debt, paid and writtenOff, together with the assetIds of that player's bankrupt AssetsReleased event in the same update. An absent release event SHALL mean no freed assets listed.

#### Scenario: Release with bankruptcy
- **WHEN** an update contains AssetsReleased and PlayerBankrupt
- **THEN** the notice SHALL show the event amounts and freed assets without inferring them from ownership differences

#### Scenario: No owned assets
- **WHEN** PlayerBankrupt arrives without AssetsReleased
- **THEN** the notice SHALL show the bankruptcy and an empty freed asset list

### Requirement: Mortgage cell markers
Each asset in view.mortgages SHALL have a diagonal hatch and dimming. Each view SHALL refresh these independently of movement animations.

#### Scenario: Mortgage changes on the same board
- **WHEN** a new view adds or removes a mortgage without regenerating the board
- **THEN** the corresponding marker SHALL appear or disappear immediately

### Requirement: Responsive turn-order roll dialog
During setup the client SHALL present a dialog on desktop and a bottom sheet on phones. It SHALL show player avatars, dice, the current roller, the server deadline countdown and tie status from the authoritative view. The local roll action SHALL follow the existing setup command availability conditions.

#### Scenario: Tie re-roll and timeout
- **WHEN** the server view shows a tie or advances after an automatic deadline roll
- **THEN** the dialog SHALL show the updated dice, tie status, roller and countdown from that view
- **AND** when setup finishes the dialog SHALL close

#### Scenario: Keyboard dismissal during setup
- **WHEN** a keyboard user dismisses the setup dialog with Esc while setup is still active
- **THEN** focus SHALL return to an accessible way to reopen the dialog
- **AND** dismissal SHALL preserve the current setup state and deadline
