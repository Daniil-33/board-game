## Implementation

- Keep the rent and debt components mounted as before, but place active rent and the latest unacknowledged debt notice in a centered opaque desktop overlay matching the existing auction treatment. Debt overlays have a dismiss control and auto-hide at the next turn start; the complete notice history stays in the non-overlay side column. Leave the board and top bar in normal layout.
- Put the active jailed turn owner's next attempt and the `three-attempt jail limit` in the turn header for every viewer.
- Keep the board caption within the board interior and reserve a clear board-center region; truncate overlong canvas captions with an ellipsis. Place the journal below its heading and assert measured caption and journal entry bounds at 1440×900.
- Build a room label from an existing creator member nickname when present; otherwise use a neutral localized “Room” label. Never interpolate room ids or access codes into display names.
- Include member names in locked-room picker options so rooms with the same creator remain distinguishable.
- Mark desktop side columns as named regions and add keyboard focus only when their content overflows.
- Label the elimination balance with localized copy.
- Keep all behavior client-only. Extend existing game-layout browser checks and focused component assertions. Regenerate evidence using the committed final-evidence tools and validate every local collector link.
- **TL-approved addition:** constrain the desktop controls column to the space below the top bar, with My Assets scrolling internally, keyboard-focusable, and a visible token-colored scrollbar. Constrain the Players column the same way when a larger roster needs scrolling. This contains long side content without changing the no-page-scroll acceptance check; mobile remains unchanged.
