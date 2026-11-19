# Visual dialogs and decision panels

## Outcome

Bring the purchase, auction, asset, rent/debt, elimination, game-over, and temporary jail-attempt status surfaces into alignment with the accepted visual-design frames, and use “Economic Board Game” as the product name on every screen. Preserve projected behavior, existing commands, and all existing test ids.

## Sources

- `docs/efforts/visual-design/tasks/TASK-vd-dialogs-2.md` revision 1
- `openspec/specs/client/game-screen/spec.md`
- `/srv/agents/evidence/TASK-vd-evidence-frames/design-frames/`
- CTO product-name decision recorded in the task handoff (2026-11-19)

## Scope

Restyle the named client widgets, game-over view and temporary jail-attempt status, update shell/document title localization, add component coverage for dialog structure and auction response states, and capture desktop/mobile evidence using the committed producer. No protocol, server, game-core, token, collector, or capture-script changes.

## Projection-bound deviations to record in the PR

- **Player avatars:** `StateView.players` supplies identity/name and ordering, but no avatar artwork or avatar identifier. Use a seat-color initial badge in the winner/elimination rows; do not add client identity data or synthesize remote avatar assets.
- **Game duration and round count:** the finished result supplies finish time, eliminations, and final balances, but no start time, elapsed duration, or round counter. Omit duration/round metrics.
- **New game in this room:** there is no new-game intent or room reset rule in the projection/protocol. Keep the existing return-to-lobby action; do not imply a new game can start in-place.
- **Rent payment and liquidation:** mandatory rent is resolved by the existing PayRent/EndTurn behavior. Show the projected shortfall and liquidation notice/steps when supplied; do not add a separate mortgage-or-sell flow to the rent panel or calculate settlement locally. Asset management remains available through existing actions.
- **Automatic liquidation:** the notice is only present when supplied by the view; no synthetic summary is shown for rent settled without liquidation.

Casino, chance, chance animation, and final jail state remain out of scope per the handoff and are not deviations.
