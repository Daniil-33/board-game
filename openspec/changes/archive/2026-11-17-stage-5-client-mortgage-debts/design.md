# Design

## Context

Base fb625a1 includes stage 5 core debt settlement. Stage 4 client already has helper-driven house controls, asset cards, protocol decoding, a revision-filtered onUpdate callback, independent board state refresh and a final-screen route. Production rent animation already consumes RentPaid.amount; the accepted client spec still says paid. The protocol task runs separately and supplies Mortgage/Redeem command types and version 5.

See proposal.md for scope and canonical references; the Team Lead design is currently available in the TL-stage-5-design worktree at the handoff path.

## Goals / Non-Goals

Expose accepted economics without reproducing transitions or collective-lap logic. Preserve immediate authoritative rendering, including eliminated viewers and terminal updates. No persistence layer or event replay history is added to the client; final results alone survive a full reload through view.result.

## Decisions

- Add one mortgage presentation helper module next to game/houses.ts. Follow its view-to-legality-input adapter, compile-time non-secret-field check and helper/projection parity tests. Use mortgageAdvance for label amounts and the stored advance for an existing mortgage. Keep an exhaustive MortgageErrorCode message map and the existing connection guards. Extend AssetCommandType and per-asset intents; never widen protocol types or bypass decoders to compensate for the dependency.
- Extend AssetCard with Mortgage/Redeem for all viewer-owned asset kinds, including disabled controls, and projected terms/pending player names. Keep existing Build/Sell behavior routed through current core helpers, including open-rent sale. State and quotes come directly from each view. A separate mortgage modal would add interaction without improving this functional stage.
- Add one debt notice parsing module and one DebtNotices component. The parser validates public event payloads as presentation data, correlates LiquidationApplied with RentPaid by payer/creditor in the same update, and PlayerBankrupt with AssetsReleased by player/reason. Preserve step order and event amounts; do not calculate debt coverage or ownership changes. Missing/malformed payloads yield no fabricated summary.
- Append valid notices from the already revision-filtered onUpdate callback into room-scoped reactive state, before animation handling. Retain notices for the room session, clear on leaving/switching rooms; Welcome does not fabricate historical notices. Render notices in both GameScreen and GameOverScreen so terminal bankruptcy is visible. A latest-event-only slot could lose a notice on a rapid subsequent update; a session list preserves every received notice. Full reload need not recover transient notices.
- Extend the existing spectator message using view.eliminations and GameOverScreen using only view.result. Keep read-only inspection and live board updates for eliminated viewers; hide gameplay controls on the terminal screen. Keep return-to-lobby behavior.
- Add a distinct mortgage mark in BoardCanvas's per-view marker refresh. Avoid rebuilding the generated board and avoid scheduling state marks through animations.
- Extend the dev-only mock with deterministic stage 5 scenarios (mortgage/redeem, expiry, tiered liquidation, bankruptcy and finish). The mock may construct core fixtures and drive core transitions; production imports remain types and pure helpers. Reuse PROTOCOL_VERSION in all frames. Use existing browser screenshot tooling without adding Playwright.

## Risks / Trade-offs

- Protocol is still stage 4 at the base → propose now; consume the server task's merged protocol before final build/PR, rebase and rerun checks. Do not modify packages/protocol.
- Events are generic wire payloads → validate notice fields and test malformed payloads; use only accepted, revision-filtered frames.
- Terminal update cancels animations → collect notices before cancellation and render them on the final screen.
- Client-only tests do not prove real server recovery → mock/remount evidence covers client behavior; task s5-e2e owns end-to-end recovery evidence.
- Session notice history uses memory proportional to received debt events → scoped to the current room and reset on exit, with no durable browser storage.

## Migration Plan

No database or stored-client migration. Integrate after TASK-s5-server and use the shared protocol version. Run build, unit tests, bundle and strict OpenSpec checks; capture mock screenshots outside Git. Independent review and all CI jobs must pass the exact PR head. Archive this change in the PR after review passes as required by the task handoff. Reverting the client PR restores the previous client; no protocol downgrade is introduced here.
