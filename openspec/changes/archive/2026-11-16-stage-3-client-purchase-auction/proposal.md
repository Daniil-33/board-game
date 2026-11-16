# Proposal

## Why

Stage 3 core now projects purchase decisions, auctions and ownership, but the client cannot display or act on them. TASK-s3-client revision 1 supplies the bounded UI outcome from ROADMAP.md stage 3 and GAME-BREAKDOWN.md § "Покупка и аукцион" and § "Начальная настройка и деньги".

## What Changes

- Add a Vue purchase dialog and public decision notice.
- Add a projected auction panel with responder controls, next amount and deadline timer.
- Show player-colour ownership markers and the owner in asset inspection.
- Pause the turn timer and disable conflicting turn controls during auctions.
- Extend client fixtures, component coverage and dev mock scripts for purchases and auctions, retaining protocol decoders and Ack errors.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `client/game-screen`: purchase decisions, auction participation, paused timer and ownership presentation.

## Impact

Only apps/client/** and this client OpenSpec delta. Uses existing core projection and display helpers. Depends on TASK-s3-server adding client command types and PROTOCOL_VERSION 3; no protocol changes in this task. No new dependencies planned.

Out of scope: rules or outcome calculation, core/server/protocol changes, rent, buildings, stage 8 visual design and Playwright e2e.
