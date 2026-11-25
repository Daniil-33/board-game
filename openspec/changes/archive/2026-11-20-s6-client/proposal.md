# Change: stage 6 client surfaces

## Why

The core and protocol now expose stage 6 casino, chance, jail, charge, and mortgage-lock state, but the client does not yet let players act on those states or explain them consistently. Add the accepted C17 surfaces and carry RVW-005/RVW-006 into the client change.

## Scope

- Add client controls, status, animations, journal descriptions, and ru/en localization for jail choice/status, casino decision/result, chance draw, bank charge payment, and redeem lock.
- Match command availability to the core's guard order and public projection.
- Add focused unit and browser smoke coverage, stable test ids, and desktop/mobile evidence.
- Update canonical engine spec wording from “interim jail release” to “jail release” in economy and purchase-auction.

## Out of scope

- Changes to game rules, core, protocol, server, or existing stage 3–5 behavior.
- The seven completion browser scenarios and design pairs owned by TASK-s6-e2e.
- New sound assets, unrelated bundle trimming, and visual-design follow-ups.

## References

- `docs/efforts/stage-6-special-cells.md` (C16, C17)
- `docs/efforts/stage-6-special-cells/design.md`, “Client”
- `docs/design/ui-brief.md`, §6.6; `docs/design/ui-mvp-v1.html`, frame `desktop-08-тюрьма-казино-шанс`
- `GAME-BREAKDOWN.md`, sections “Тюрьма”, “Казино”, “Шанс”, “Ипотека”

## Design

Keep selectors and command eligibility in client entities/features, presentation in FSD widgets/features, and reuse the rent payment card and `game-dialogs` responsive bottom-sheet patterns. Jail and casino commands send only the accepted intents. Charge permits payment and existing mortgage/sale actions while keeping build/redeem blocked. Every viewer sees public jail/casino/chance events; transient result surfaces honor reduced-motion. Journal chance labels are localized signed percentage and amount strings. Preserve the desktop no-page-scroll invariant and use the existing mobile bottom-sheet pattern, recording the absent mobile frame as a deviation.

## Risks

- Gating must remain equivalent to core guard ordering, especially roll state, pending payments, available cash, and deadline.
- Desktop overlay sizing must preserve the no-scroll invariant; mobile composition has no approved frame.
- Bundle growth is limited to 343,863 B under the handoff's per-file gzip method.
