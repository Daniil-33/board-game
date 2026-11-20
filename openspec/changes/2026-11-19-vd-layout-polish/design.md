## Implementation

- Keep the rent and debt components mounted as before, but place any active rent/debt surface in a centered opaque desktop overlay matching the existing auction treatment. Leave the board and top bar in normal layout.
- Put the active jailed turn owner's next attempt and the `INTERIM_JAIL_RULE.maxAttempts` in the turn header for every viewer.
- Reserve a clear board-center region for the canvas phase caption and place the journal below it. Assert the caption's projected canvas bounds do not intersect the journal at 1440×900.
- Build a room label from an existing creator member nickname when present; otherwise use a neutral localized “Room” label. Never interpolate room ids or access codes into display names.
- Label the elimination balance with localized copy.
- Keep all behavior client-only. Extend existing game-layout browser checks and focused component assertions. Regenerate evidence using the committed final-evidence tools and validate every local collector link.
- **TL-approved addition:** constrain the desktop controls column to the space below the top bar, with My Assets scrolling internally, keyboard-focusable, and a visible token-colored scrollbar. Constrain the Players column the same way when a larger roster needs scrolling. This contains long side content without changing the no-page-scroll acceptance check; mobile remains unchanged.
