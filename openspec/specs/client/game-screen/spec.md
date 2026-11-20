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
`RollForOrder` SHALL require setup and viewer `setup.playerId`. `RollDice` SHALL require playing, viewer turn ownership and `rolled: false`; `EndTurn` SHALL require playing, viewer ownership and `rolled: true`. Buttons SHALL be disabled while disconnected, while the command type is pending, or past the server deadline. The turn panel SHALL show current-phase actions only, make the applicable action primary, and keep unavailable actions visible, disabled, with visible text reasons.

#### Scenario: Before and after the roll
- **WHEN** it is the viewer's regular turn before the roll, then after the roll
- **THEN** only the applicable action is enabled and primary, unavailable regular-turn actions remain visible and disabled with their visible reasons, and the setup-only order roll is hidden

#### Scenario: My order roll
- **WHEN** the phase is setup and setup.playerId is the viewer
- **THEN** only the setup flow's RollForOrder action is shown as applicable and regular-turn actions are hidden

#### Scenario: Not my turn
- **WHEN** the view's turn.playerId is another player
- **THEN** RollDice and EndTurn SHALL be disabled and one visible reason message SHALL identify that player instead of repeating a reason for each button

#### Scenario: Pending command
- **WHEN** the viewer pressed RollDice and its Ack has not arrived
- **THEN** RollDice SHALL be disabled

#### Scenario: Auction in progress
- **WHEN** a player views an ongoing auction or purchase decision
- **THEN** regular-turn RollDice and EndTurn actions SHALL NOT be shown

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
A player panel SHALL show each participant's nickname and avatar in projected seat color, projected balance via Money, house count, and applicable current-turn, in-debt and eliminated badges from the view. It SHALL label the current turn as paused on the roster and in the header when the projected turn is paused. Each new server view SHALL refresh balances, including lap rewards. The production client SHALL NOT calculate prices, capital or rewards.

#### Scenario: Lap reward update
- **WHEN** an Update supplies a new balance after a lap reward
- **THEN** the panel SHALL display the supplied balance immediately, independently of queued movement animation

#### Scenario: Eliminated participant remains visible
- **WHEN** an eliminated participant is absent from the active turn order
- **THEN** the panel SHALL retain their nickname, projected balance and eliminated mark

#### Scenario: Paused turn
- **WHEN** the active turn has a projected paused remaining time, including zero
- **THEN** the roster entry and turn header SHALL display a translated paused label

### Requirement: Asset inspection
Selecting an asset from the board or “Мои активы” SHALL open a responsive inspection surface using only the current server board and projection. It SHALL show asset details and public rent tiers, highlight the projected current tier, and show owner actions only to the owner. Dismissing it SHALL restore focus to its opener.

#### Scenario: Card content
- **WHEN** an asset inspection surface opens
- **THEN** it SHALL show the projected company name, category, group, rank when present, price, owner name or “free”, and other group members with their prices and cell indices

#### Scenario: Actions on owned assets
- **WHEN** the viewer opens their own asset card
- **THEN** it SHALL offer Mortgage and Redeem for the asset and Build and Sell for a monopoly asset; cards for other assets SHALL omit these actions

#### Scenario: Monopoly details
- **WHEN** a player opens a monopoly asset
- **THEN** its card SHALL show the company, category, group, rank, price and other assets with the same groupId, prices and cell indices

#### Scenario: Logistics and energy details
- **WHEN** a logistics or energy asset is selected
- **THEN** its card SHALL show its projected category, group, price, owner name or “free”, and other group members without inventing a monopoly rank

#### Scenario: Rent schedule tiers
- **WHEN** an asset card opens for a regular, logistics or energy asset
- **THEN** the table SHALL show the public schedule from game-core: regular base, complete-group base and one through four houses; logistics rent by one through four holdings; or energy rent rates for dice sums 2 through 12
- **AND** energy values SHALL be presented as per-dice-sum rates, not as one fixed rent

#### Scenario: Current tier follows the view
- **WHEN** a new view changes the selected asset's projected owners, houses or rent quote
- **THEN** the highlighted row SHALL reflect the current rent tier from those projected values

#### Scenario: Dismiss card
- **WHEN** an open asset card receives Escape or its close control is clicked
- **THEN** the card SHALL close and focus SHALL return to its opener

#### Scenario: Special cell click
- **WHEN** no card is open and a non-asset cell is clicked
- **THEN** no card SHALL open

#### Scenario: Ownership changes
- **WHEN** a new view assigns the selected asset an owner
- **THEN** the open card SHALL display that owner from the current projection

#### Scenario: Desktop hover
- **WHEN** the pointer hovers over an asset cell on a hover-capable desktop
- **THEN** its tooltip SHALL show the full company name and formatted projected price
- **AND** it SHALL append “· В залоге” when mortgaged, omit the suffix otherwise, and refresh when a view changes the mortgage state while the pointer remains still

#### Scenario: Portfolio opener focus return
- **WHEN** an asset card is opened from “Мои активы” and dismissed
- **THEN** focus SHALL return to that asset's portfolio control

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
Purchase and auction controls SHALL send null-payload intents through the existing protocol connection. Purchase intents SHALL target the projected turn; Bid and PassAuction SHALL target the projected auction responseId. An Ack rejection SHALL show its client-translated title and reason without protocol codes or server-provided messages in visible text. The code SHALL remain available in `data-code` and diagnostic logs, and accepted Acks SHALL NOT locally change ownership or settle an auction.

#### Scenario: Rejected stale bid
- **WHEN** the server rejects a bid with an Ack error
- **THEN** the toast SHALL show the Bid title on a separate bold line and the translated reason below it, the HUD SHALL show both on one line, neither SHALL display the code or server message, the message element SHALL retain the code in `data-code`, and the client SHALL retain the latest projected auction

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
Rejected `BuildHouse` and `SellHouse` acknowledgements SHALL show their client-translated action title and mapped reason. Other rejected commands SHALL show their command title and a translated reason when available. Visible rejection copy SHALL NOT contain protocol codes or server-provided messages. Unknown codes SHALL use the translated retry prompt. The code SHALL remain available in the message element's `data-code` attribute.

#### Scenario: Illegal build rejected
- **WHEN** the server rejects BuildHouse with `UNEVEN_BUILD`
- **THEN** the HUD SHALL show the build title and translated uneven-build reason, without the code or server message, and the view SHALL stay as last projected

#### Scenario: Shared code on another command
- **WHEN** the server rejects BuyAsset or Bid with `INSUFFICIENT_FUNDS`
- **THEN** the HUD SHALL show that command's title and translated reason without the code, server message, or a house reason

### Requirement: House markers
Every asset cell SHALL show 1-4 PixiJS house pips equal to `view.houses` for that asset and none when absent. Markers SHALL refresh on each view independently of movement animations, like owner markers.

#### Scenario: Houses change without board regeneration
- **WHEN** a new view changes an asset's houses from 2 to 3
- **THEN** that cell SHALL show three markers

#### Scenario: Pips alongside asset details
- **WHEN** a readable-size asset cell shows house pips on any side of the board
- **THEN** the pips SHALL sit clear of the company name and price strip

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

### Requirement: Turn and asset panels
My Turn SHALL distinguish its primary action from secondary and danger controls. My Assets SHALL group owned assets by color group and display group gradients, the dark-surface logo or monogram, house pips and mortgage status. Build, sell house, mortgage and redeem SHALL use existing legality adapters. Disabled controls SHALL expose their reasons by tooltip on desktop and visible text on mobile.

#### Scenario: Owned property controls
- **WHEN** an owned asset permits building, selling a house, mortgaging or redeeming
- **THEN** the corresponding control SHALL send the existing command
- **AND** unavailable controls SHALL explain why

### Requirement: Combined event journal and chat
The journal SHALL show only projected events and chat received through the existing room session, with translated event descriptions, icons, actors and amounts when supplied. Unknown events SHALL yield no journal row. The composer SHALL enforce the server text rules, including trimmed length of 1–300 characters and at most four lines, and display the translated ChatAck rejection reason. Room members SHALL be able to send regardless of elimination or spectator status.

#### Scenario: History and live delivery
- **WHEN** the journal receives Welcome history followed by live chat and updates
- **THEN** history SHALL be ordered by server timestamp and live entries SHALL appear in frame arrival order
- **AND** duplicate chat frames SHALL NOT add rows

#### Scenario: Reading earlier entries
- **WHEN** a live item arrives while the viewer is reading above the bottom
- **THEN** the journal SHALL preserve their scroll position
- **AND** live chat arriving while the mobile Journal tab is unread SHALL be indicated by a dot

### Requirement: Command rejection and reconnect feedback
Toasts SHALL show a client-translated bold title above the translated reason; live announcement SHALL include both. HUD SHALL show title and reason on one line. HUD messages for commandless Error frames SHALL use “Ошибка сервера” / “Server error” and the mapped reason, otherwise retry copy. CTO decision (2026-11-19 ~07:08Z, option A): visible copy SHALL be localized title/reason only, never code or server message; codes remain in `data-code` and logs.

#### Scenario: Multiple rejections
- **WHEN** more than three command rejections arrive in quick succession
- **THEN** at most three toasts SHALL be shown at once

#### Scenario: Rejected build
- **WHEN** a `BuildHouse` command is rejected with `BUILD_QUOTA_USED`
- **THEN** the toast SHALL show “Нельзя построить дом” as its bold title and the translated reason below it, the HUD SHALL show both on one line
- **AND** neither SHALL show the code or server message
- **AND** the message element SHALL retain `data-code="BUILD_QUOTA_USED"`

#### Scenario: Unknown rejection reason
- **WHEN** a client command is rejected with an unknown code
- **THEN** the client SHALL show the translated title for that command and a translated retry prompt without displaying the code or server message

#### Scenario: Server Error frame
- **WHEN** the client receives an Error frame with a reason-mapped code and a server payload
- **THEN** the HUD SHALL show “Ошибка сервера” / “Server error” with the client-translated reason, without the code or server message

#### Scenario: Unknown server Error reason
- **WHEN** the client receives an Error frame whose code has no translated reason
- **THEN** the HUD SHALL show “Ошибка сервера” / “Server error” with the localized retry copy, without the code or server message

### Requirement: Reconnect status
The game SHALL announce reconnecting with a status banner until Welcome restores the session. Reconnect banner and offline HUD SHALL say in the active locale that the game and timers continue.

#### Scenario: Recovery
- **WHEN** a disconnected game session receives its next Welcome
- **THEN** the reconnect banner SHALL disappear

#### Scenario: Reconnect status
- **WHEN** the client is disconnected and reconnecting
- **THEN** the banner and offline HUD status SHALL include the localized equivalent of “Партия продолжается, таймеры идут”

### Requirement: Responsive decision and asset surfaces
Purchase response SHALL use a modal dialog on desktop or bottom sheet on mobile only for the decider; others SHALL see non-modal status. Auctions SHALL be inline on desktop. On mobile, only the current responder SHALL see a sheet; others SHALL see inline content, and it SHALL open when its viewer becomes responder. Decision surfaces SHALL use the current projection and legality adapters. Asset inspection SHALL use a responsive dialog on desktop and bottom sheet on mobile.

#### Scenario: Purchase surface by viewport
- **WHEN** a projected purchase decision is visible on desktop or mobile
- **THEN** it SHALL show the group gradient, logo or monogram, category, asset name, price, rent preview, current balance, exact post-purchase balance when affordable, legal actions and countdown, with disabled reasons and the timeout note
- **AND** the rent preview SHALL remain visible or expandable at mobile widths
- **AND** the post-purchase balance SHALL equal the projected balance minus the fixed asset price as specified in purchase-auction.ts:131-134; when unaffordable it SHALL be omitted and the existing insufficient-funds reason SHALL appear on Buy
- **AND** the deciding player SHALL not be able to dismiss the response surface before answering

#### Scenario: Auction surface by viewport
- **WHEN** a projected auction is visible on desktop or mobile
- **THEN** desktop SHALL show it inline in the centre column and mobile SHALL show a bottom sheet for the current responder and inline content for everyone else, with the asset, projected leading bid and leader in that player's seat color, the existing legal bid increments, pass action, and response timer with a visible last-seconds state
- **AND** only the active responder's mobile sheet SHALL be non-dismissible

#### Scenario: Purchase response and bystanders
- **WHEN** a projected purchase decision is visible to the deciding player and to other participants, eliminated players, or spectators
- **THEN** only the deciding player SHALL see the non-dismissible dialog
- **AND** every other viewer SHALL see a non-modal status identifying who is deciding, the asset, its price, and the countdown

#### Scenario: Mobile auction responder and bystanders
- **WHEN** a projected auction is visible on mobile
- **THEN** only the current responder SHALL see the non-dismissible bottom sheet
- **AND** every other viewer SHALL see live inline auction content with the leader, bid, and timer
- **AND** the sheet SHALL open when a viewer becomes the responder

#### Scenario: Desktop auction viewers
- **WHEN** a projected auction is visible on desktop
- **THEN** every viewer SHALL see inline auction content with the leader, bid, and timer

#### Scenario: Other viewers keep access
- **WHEN** a non-deciding viewer sees a purchase status or a non-responder sees inline auction content
- **THEN** the status SHALL remain visible without a dialog and the auction SHALL remain visible inline
- **AND** chat SHALL remain available to the viewer

#### Scenario: Asset inspection from board and portfolio
- **WHEN** an asset is opened from its board cell or from “Мои активы”
- **THEN** the card SHALL show its projected owner, group chips with owners and houses, full rent table with a percent-of-price column and projected current tier highlighted, house-cost and mortgage tiles, and owner actions with their mapped reasons
- **AND** a mortgage term SHALL be shown only when supplied by the projection

### Requirement: Rent shortfall and debt resolution surfaces
The rent surface SHALL show the amount due and creditor, a shortfall hint with the amount missing when projected data indicates a shortfall, and entry points for manual mortgage and sale. Debt notices SHALL show the liquidation summary, including sold or mortgaged assets and amounts from the view. Clients SHALL NOT calculate amounts from design examples.

#### Scenario: Rent with and without shortfall
- **WHEN** a rent view shows the payer's shortfall or sufficient funds
- **THEN** the panel SHALL show the projected amount and creditor and SHALL show the missing amount only in the shortfall case

#### Scenario: Liquidation summary
- **WHEN** a view contains liquidation steps
- **THEN** the summary SHALL list each sold or mortgaged asset and its projected amount

### Requirement: Elimination and game-over presentation
Elimination and game-over surfaces SHALL show final standings from the view and offer leave or back-to-lobby actions. An eliminated player SHALL remain able to watch the game and use chat.

#### Scenario: Eliminated player keeps watching
- **WHEN** the viewer is eliminated while the game continues
- **THEN** the elimination screen SHALL be visible while current game state and chat remain available

#### Scenario: Game over standings
- **WHEN** the projected game is complete
- **THEN** the winner SHALL be first with place 1, followed by eliminated players in standings order with projected reasons, times and final balances; the screen SHALL provide a leave or back-to-lobby action

### Requirement: Decision surface accessibility
Every dialog and sheet SHALL trap focus, expose `aria-modal="true"`, return outside focus attempts to its content, and restore focus when dismissed. Escape SHALL dismiss only surfaces for which the viewer has no required rules response.

#### Scenario: Modal focus containment
- **WHEN** a dialog or sheet is open and a focus attempt targets content outside it
- **THEN** focus SHALL remain inside the open surface and the surface SHALL expose `aria-modal="true"`

#### Scenario: Escape policy
- **WHEN** Escape is pressed with an asset inspection surface or another dismissable surface open
- **THEN** that surface SHALL close and return focus to its opener
- **WHEN** Escape is pressed with a deciding player's purchase response, an active responder's auction sheet, rent payment or game-over open
- **THEN** that surface SHALL remain open
- **WHEN** a purchase decision belongs to another player or an auction response belongs to another player
- **THEN** the viewer SHALL receive no dialog or sheet for that decision and SHALL retain access to the underlying chat

### Requirement: Live game events trigger sounds
The game screen SHALL map live Update events to sound ids with ownership rules
from the accepted visual-design sound profile. Welcome history SHALL be silent.

#### Scenario: Live update versus reconnect history
- **WHEN** a live Update contains a mapped event, or Welcome contains the same event as history
- **THEN** only the live Update SHALL trigger sound

### Requirement: Live chat and animation trigger sounds
Incoming chat from another player SHALL play chat sound; own chat SHALL not.
Auction response timers SHALL tick only in their final three seconds and at
most once per second. Token steps SHALL sound during movement unless reduced
motion is requested.

#### Scenario: Other player's chat
- **WHEN** a new chat message arrives from another player
- **THEN** the client SHALL play the attenuated chat sound
- **AND** own messages and Welcome history SHALL remain silent

#### Scenario: Auction response countdown
- **WHEN** an auction response timer enters its final three seconds
- **THEN** it SHALL tick at most once for each remaining second

#### Scenario: Reduced motion
- **WHEN** movement runs with reduced motion enabled
- **THEN** token-step sound SHALL be skipped

### Requirement: Accessible sound controls
Translated mute and volume controls SHALL be keyboard accessible in the desktop
game header and the mobile “Ещё” panel.

#### Scenario: Desktop and mobile controls
- **WHEN** the game screen is used at desktop or mobile width
- **THEN** translated mute and volume controls SHALL be available in the appropriate location and operable by keyboard

### Requirement: Deferred game screen uses the recovered session
The asynchronously loaded game screen SHALL render the latest authoritative
view and preserve existing game controls, reconnect feedback, and direct-reload
behavior. Loading the game screen SHALL NOT require a protocol or server change.

#### Scenario: Session updates while game code loads
- **WHEN** the server sends a newer game view before the deferred game screen is ready
- **THEN** the game screen SHALL render the latest view when it becomes ready

#### Scenario: Reconnect after direct reload
- **WHEN** a direct reload restores an active room and the socket reconnects while game code is being loaded
- **THEN** the game screen SHALL show the restored projection and clear reconnect feedback after Welcome

#### Scenario: Preserve sound activation through lazy loading
- **WHEN** a player interacts with the page before entering a game
- **THEN** the lazy sound engine SHALL adopt the AudioContext created by the shell gesture gate without requiring another gesture

### Requirement: Board-centre phase caption
The board-centre caption SHALL describe the current projected game phase: turn-order roll, regular roll, rent or debt, and game over. It SHALL update when the projected phase changes and SHALL NOT retain a caption from a prior phase.

#### Scenario: Auction caption
- **WHEN** the projection contains an active auction
- **THEN** the board-centre caption SHALL be hidden using the board display input

#### Scenario: Finished game caption
- **WHEN** the projection phase is finished
- **THEN** the board-centre caption describes the completed game

### Requirement: Projected rent details
The rent surface SHALL identify payer and asset, show the projected creditor and amount due, and derive any displayed shortfall only from projected balance and rent.

#### Scenario: Projected rent context
- **WHEN** a rent view is shown
- **THEN** the payer, asset, creditor and amount due SHALL come from the projection

### Requirement: Projected elimination details
Elimination and game-over surfaces SHALL show projected reasons and times, winner-first standings with final balances, and existing projected actions. Initials SHALL reuse the player-panel avatar and seat color; no avatar art, identity fields, duration, round count or new in-room game action SHALL be added.

#### Scenario: Projected elimination summary
- **WHEN** an elimination or game-over surface is shown
- **THEN** projected reasons, times, standings and available actions SHALL be shown

### Requirement: Responsive game layout and navigation
The game screen SHALL keep existing in-game actions reachable and preserve their command and legality contracts. At 1024 px and above it SHALL place players on the left, the turn header, scaling board and journal with chat in the center, and My Turn and My Assets on the right. Side columns SHALL be approximately 240 px wide from 1024 to 1279 px and approximately 280 px from 1280 px. The centre SHALL contain the turn header, dice and last roll, and journal with chat.

#### Scenario: Desktop game screen
- **WHEN** the game is rendered at 1440×900
- **THEN** the top bar shows the product name “Economic Board Game”, correctly localized player count, connection status including reconnect state, and settings control, without a room label; the centre contains the turn header, dice and last roll, and journal with chat; and the turn header shows current player, phase, countdown and available dice

#### Scenario: Room label and round counter are omitted
- **WHEN** the top bar is rendered
- **THEN** it omits the room label and round counter, does not expose the join secret or internal room id, and does not require new projection fields

#### Scenario: Sound settings
- **WHEN** the settings control is opened
- **THEN** the existing volume and mute controls are available with their existing behavior and test identifiers

#### Scenario: Mobile game navigation
- **WHEN** the viewport is below 1024 px
- **THEN** the game SHALL offer bottom tabs for Board, Assets, Journal and More, with the board sized to the available width and resign, rules summary and leave accessible in More
- **AND** a server view update SHALL preserve the selected tab

#### Scenario: Leaving an active game
- **WHEN** an active player opens More
- **THEN** leaving for the lobby SHALL remain disabled with a reason until the view shows their elimination. Players who choose to leave SHALL use the existing resignation confirmation
- **AND** eliminated and non-playing viewers SHALL be able to return to the lobby

#### Scenario: Supported widths
- **WHEN** the game is rendered at widths 360, 390, 768, 1024, 1440 and 1920 px
- **THEN** the page SHALL have no horizontal overflow

### Requirement: Product name on every screen
The login, lobby, room and game headers, including the mobile game header, and the document title SHALL display “Economic Board Game”.

#### Scenario: Product name surfaces
- **WHEN** any application screen is rendered in either locale
- **THEN** each visible product heading and the document title SHALL display “Economic Board Game”

### Requirement: Opaque decision surfaces
Purchase and auction dialogs, sheets and status surfaces SHALL use a defined opaque surface token so board content cannot show through them.

#### Scenario: Decision surface overlays
- **WHEN** a purchase or auction surface overlays the board at a supported viewport
- **THEN** its background SHALL be opaque and the page SHALL not scroll to reach its controls

### Requirement: Jail-attempt status
The order panel SHALL show the projected jail attempts used out of three attempts. It SHALL use only attemptsUsed. Jail action controls are specified by TASK-s6-client.

#### Scenario: Jail status
- **WHEN** the current projection marks a player in jail
- **THEN** that player's order row SHALL show their current used attempts out of the configured maximum

### Requirement: Turn header contents
The turn header SHALL show the current player, phase, countdown and dice using the current projection; it SHALL NOT require new projection fields.

#### Scenario: Projected turn information
- **WHEN** a player views a turn header
- **THEN** the current player, phase, countdown and available dice match the current projection

### Requirement: Desktop viewport fit
At 1440×900 and 1920×1080, the board and decision controls SHALL fit without page scrolling, including the bottom row.

#### Scenario: Desktop decision viewport fit
- **WHEN** a purchase or auction decision is shown at 1440×900 or 1920×1080
- **THEN** the whole board and decision controls fit within the viewport without page scrolling

### Requirement: Desktop timing indicator
The desktop turn progress bar SHALL be omitted because the projection supplies a deadline but no turn duration; no duration estimate or new projection field SHALL be added.

#### Scenario: No duration estimate
- **WHEN** the game screen is rendered on desktop
- **THEN** the turn countdown may be shown, but a progress bar based on an estimated duration is not shown

### Requirement: Purchase card content
Purchase cards SHALL show category, group size, price, base rent, other group owners and the rent preview, using dark-on-light category and name text with WCAG AA contrast. They SHALL show current balance and, when affordable, exact balance after purchase. After purchase the projected balance SHALL be reduced by the fixed asset price per purchase-auction.ts:131-134; if unaffordable, omit the after amount and show the existing insufficient-funds reason on Buy.

#### Scenario: Affordable and unaffordable purchase
- **WHEN** the deciding player can afford the asset, or cannot afford its price
- **THEN** the current balance is shown in both cases; the after balance appears only when affordable, otherwise Buy shows the insufficient-funds reason

### Requirement: Auction panel content
Auction panels SHALL show current bid with start and step, leader, ordered response states, response timer bar, legal Raise and Pass actions, and the irrevocable-pass note from the current projection.

#### Scenario: Response queue changes
- **WHEN** the auction leader, responder, or passed players change
- **THEN** the ordered queue and each player's state SHALL match the current projection

### Requirement: Asset card content
Asset cards SHALL show category, projected rank when present, price and name in dark-on-light text with WCAG AA contrast; group chips with projected owners and houses; a rent schedule with the current projected tier and percent of price; house-cost and mortgage tiles; and existing owner actions in a two-column grid with each reason below its button. A mortgage term SHALL appear only when supplied by the projection.

#### Scenario: Owned asset details
- **WHEN** the viewer opens an owned asset
- **THEN** the current group member and rent tier are highlighted, and each available action retains its existing command and projected reason

### Requirement: Asset rent schedule headings
Asset-card rent schedules SHALL label house tiers as tiers and SHALL reserve the “Assets” heading for logistics and holdings schedules.

#### Scenario: House and holdings headings
- **WHEN** an asset rent schedule is rendered
- **THEN** house-based schedules use a tier heading and logistics or energy holdings schedules use the holdings heading

### Requirement: Board-centre caption during decision surfaces
While a purchase or auction decision surface is visible, the board-centre caption SHALL be hidden using the board display input so it never peeks beneath the surface.

#### Scenario: Purchase or auction decision caption
- **WHEN** a purchase or auction decision surface is visible
- **THEN** the board-centre caption SHALL be hidden using the board display input

### Requirement: Game-over action visibility
At 1440×900 the return-to-lobby action SHALL remain visible without scrolling, or the card body SHALL scroll with the action pinned visible.

#### Scenario: Game over at desktop height
- **WHEN** the game-over screen is rendered at 1440×900
- **THEN** the return-to-lobby action is visible in the viewport

### Requirement: Desktop decision and debt surfaces remain visible
At 1440×900 and 1920×1080, active rent, liquidation, and bankruptcy surfaces SHALL be fully visible without page scrolling, together with the top bar and the board's bottom row. Rent SHALL visibly identify its payer. Only the latest debt notice not acknowledged by the viewer SHALL appear as an overlay. The viewer SHALL be able to dismiss it, and the next turn SHALL hide it automatically. Earlier debt notices SHALL remain readable in a non-overlay history list.

#### Scenario: Rent shortfall on desktop
- **WHEN** a rent shortfall is active at either supported desktop viewport
- **THEN** the rent payer and complete rent card are visible without page scrolling, and the top bar and bottom board row remain visible

#### Scenario: Debt notice on desktop
- **WHEN** a liquidation or bankruptcy notice is active at either supported desktop viewport
- **THEN** the complete notice is visible without page scrolling, and the top bar and bottom board row remain visible

### Requirement: Desktop side columns stay within the viewport
At desktop widths, the controls column SHALL be constrained below the top bar. The My Assets region SHALL scroll internally when its contents exceed the available height, remain keyboard-focusable, and retain a visible scrollbar styled with existing tokens. The Players column SHALL use the same containment when its roster exceeds the available height. Mobile layout SHALL remain unchanged.

#### Scenario: Long assets beside a debt notice
- **WHEN** a liquidation fixture has more assets than fit in the desktop side column
- **THEN** the page SHALL not scroll, the My Assets region SHALL scroll internally and be keyboard-focusable, and the complete debt notice, top bar, and board bottom row SHALL remain visible

#### Scenario: Notice dismissal and next turn
- **WHEN** a viewer dismisses the latest debt notice or the next turn starts
- **THEN** its overlay SHALL disappear while the debt history remains readable without blocking the board

#### Scenario: Overflow-only keyboard stops
- **WHEN** a desktop side column's content fits its available height
- **THEN** its named region SHALL not add a keyboard tab stop; when it overflows, the region SHALL receive `tabindex="0"`

### Requirement: Jail progress is visible
When the active turn owner is in jail, every viewer's turn header SHALL show that player is in jail and the ordinal of the next release attempt out of three attempts.

#### Scenario: Observer sees next jail attempt
- **WHEN** the active turn owner has a jail entry
- **THEN** the turn header shows the next attempt and maximum attempt count to the jailed player and observers

### Requirement: Board caption does not overlap journal
At 1440×900 and 1920×1080, the board-center phase caption SHALL fit within the board interior and SHALL not intersect the journal panel. The board-interior journal SHALL keep its newest entry, including all text and its timestamp, fully visible inside the list's visible client area below the “Журнал” heading, without covering the dice/status area or board ring.

#### Scenario: Desktop caption and newest journal entry geometry
- **WHEN** the board is rendered at 1440×900 or 1920×1080 with a phase caption and a journal entry
- **THEN** the measured caption bounds fit within the board interior and do not intersect the journal, and the last journal entry's full box is inside the list's visible client rect with its top at or below the heading's bottom

### Requirement: Room display names contain no internal identifiers
Lobby room rows and waiting-room headings SHALL use “Room <creator nickname>” when the existing room payload includes the creator's nickname; otherwise they SHALL use a neutral “Room” label. They SHALL never display the internal room id or access code as a name.

#### Scenario: Creator nickname is available
- **WHEN** a listed or joined room contains its creator in the member list
- **THEN** the room name uses that creator's nickname

#### Scenario: Same creator in locked room options
- **WHEN** two locked rooms have the same creator nickname
- **THEN** each option includes its member names so the rooms remain distinguishable

#### Scenario: Creator nickname is unavailable
- **WHEN** a room does not contain its creator in the member list
- **THEN** the room name is neutral and contains neither its internal id nor access code

### Requirement: Elimination balance is labeled
An elimination dialog that shows the eliminated player's balance SHALL label the amount.

#### Scenario: Zero balance
- **WHEN** an eliminated player's balance is zero
- **THEN** the dialog shows a localized balance label followed by zero
