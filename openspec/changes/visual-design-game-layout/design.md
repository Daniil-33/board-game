# Design

## Context

The branch starts at a931758, after the shell and board merges. GameScreen owns the Pixi mount and intent bindings. Hud mixes turn display, setup, actions and messages. The room session already exposes projected events, chat and rejected commands. The visual-design handoff revision 2 and desktop and mobile HTML frames govern presentation.

## Goals / Non-Goals

Use a single responsive game page with shared controls, existing legality adapters, and a combined journal. Keep the board mount and existing dialog lifecycle independent of navigation. Preserve rules, commands, projection, board renderer and dialog presentation. Reserve space for the later sound task.

## Decisions

- Compose the desktop grid at 1024 px with approximately 240 px side columns, widening them to approximately 280 px at 1280 px. Give the board a shrinkable center track. Below 1024 px use existing Reka tabs with page-local selection so server updates preserve the active tab. Keep one board mount and one instance of each existing dialog.
- Use projected seat order for the roster palette, ownership and houses for the house count, and the projected pending rent payer for the debt badge. The roster and header use a translated paused label when `view.turn.pausedRemainingMs` is present. Preserve setup focus and turn-order behavior. Reuse Countdown and use the visible dice events for playing dice.
- Move turn presentation into My Turn and reuse turn-actions availability. Build My Assets from owned board assets with the existing house and mortgage adapters, house pips, mortgage indicators, and dark variant logos with monogram fallback. Keep existing asset card actions and selectors. Use tooltip and visible mobile explanations for disabled actions.
- Capture feed order at the existing session callbacks. Replace the journal on Welcome using both projected history arrays in server timestamp order with a deterministic tie order. Append each subsequent frame in arrival order and retain chat sequence deduplication. Preserve the existing event and chat stores for setup and acknowledgements. Describe visible events in the event entity, skip unknown types, and format translated amounts and actor names in the UI. Use the existing send-chat validator and outgoing acknowledgement state. Track unread live chat and preserve reader scroll position unless already at the bottom.
- Use an app-scoped queue of at most three Toasts for command rejections, preserving translated reason mappings and compatibility hooks. Render the reconnect status from the existing connection lifecycle until Welcome. Keep fatal and other connection feedback reachable. Reuse the existing leave flow in mobile More and place the approved rules summary there.
- Compare the merge-base and candidate production manifests and gzip per-file sizes. Classify the entry and its static dependency closure as initial-route assets. Capture the desktop and four mobile tab views alongside the HTML frames in the task evidence directory.

## Risks / Trade-offs

Separate live arrival order from history timestamps because live event and chat timestamps have different origins. Test interleaving, out-of-order timestamps, reconnect replacement and duplicate sequences. Exercise existing setup, board selection, dialogs and actions at desktop and mobile widths.

### Brief-vs-rules gaps

The Team Lead accepted these omissions on 2026-11-18. Omit current capital entirely because the existing projection supplies no current valuation and the rules define only starting capital. Omit the per-player disconnected badge because StateView supplies no presence. Show the projected paused turn state in the roster and header. Carry both omissions into the PR body for the effort summary.
