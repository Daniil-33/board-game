# Design

## Context

See proposal.md for motivation and TASK-s3-client revision 1 for acceptance. The current screen provides a shared 250 ms clock, pending command types, names and Ack errors. BoardScene caches generated cells by boardDisplayKey; ownership is separate state. The client command union currently lacks stage 3 commands, owned by TASK-s3-server.

## Goals / Non-Goals

Goals: consume projected state in Vue and PixiJS while retaining existing networking, animation and display boundaries.
Non-goals: outcomes, auction order or reservation calculation, new protocol fields, and replacement of the existing UI stack.

## Decisions

- Add PurchaseDialog and AuctionPanel to GameScreen with view, viewer, connection, pending commands and shared now inputs. Use the existing command emit path and name resolver. Keep the inspection card informational. Separate components permit direct role/affordability testing; embedding all markup in Hud would mix independent responsibilities.
- Extend display selectors in game/view.ts for the four stage 3 intents, deriving the next amount with the accepted pure nextBidAmount display helper. Use auctionResponse/responseId for auction expectations, turn/turnId for purchases. Do not infer results or fold events. Keep the turn-action type limited to the three existing turn buttons.
- Extend TurnTimer with explicit pause input; auction panel computes its own deadline display from responseDeadline and shared now. A local duration countdown would drift after reconnect and is rejected.
- Draw ownership in a separate Pixi layer refreshed from each projected view, including while movement runs. Preserve token animations and group markers. Extend the board adapter with a projection-only ownership refresh as needed; rebuilding the generated board or waiting for animation idle would delay ownership.
- Pass current owner/name data to AssetCard so an already open card updates. Use the existing player index palette for all owner markers, including eliminated owners.
- Update dev mock automation to handle pending decisions and auction responses through core commands/deadlines. Add deterministic scripts/tests for direct purchase, outbid/pass/timeout and unsold auctions. Use PROTOCOL_VERSION in all touched fixtures. Mock-only core execution remains outside production imports.

## Risks / Trade-offs

- Protocol command union is updated in parallel → integrate current main after TASK-s3-server merges before final typecheck; never alter protocol here or bypass it with casts.
- Projection changes can arrive without auction events → test Welcome and PlayerResigned-only Updates, pending Acks, restored leaders and next amounts.
- Ownership refresh must not cancel movement → test the board refresh path while an animation is pending.
- Screenshots need an available browser → discover existing browser tooling during verification, without adding Playwright to the project.

## Migration Plan

No persistence migration. Ship with stage 3 protocol/server; rollback with the matching client/server version. Rebase on current main before the PR. Keep screenshots outside Git in /srv/agents/evidence/TASK-s3-client/.
