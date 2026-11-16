# Tasks

## 1. Selectors and intents

- [x] 1.0 Export pure `houseCost` / `houseRefund` from game-core `houses.ts`, used by the core; verify a core test against `HouseBuilt.cost` / `HouseSold.refund`.
- [x] 1.1 Add `game/houses.ts` (legality adapter over `buildLegality` / `saleLegality`, cost/refund labels from the core helpers, reason map) for Build and sell controls; verify a parity test against real core states for every reachable `HouseErrorCode`, and cost/refund against core events.
- [x] 1.2 Extend `game/view.ts` and the connection for Rent and building intents and Intents only (payload, turn target); verify frame tests through `decodeClientFrame`, rejected Ack reason text, accepted Ack leaving the view unchanged.

## 2. Vue

- [x] 2.1 Add `RentPanel.vue` and wire GameScreen for Rent settlement display and Settlement does not block ending the turn; verify payer/owner/other/eliminated/spectator roles, energy dice sum, pending/disconnected/expired, EndTurn note.
- [x] 2.2 Extend `AssetCard.vue` for Houses and rent quote on the asset card and Build and sell controls; verify all three quote kinds, house updates on an open card, each reason message, cost and refund labels, no controls for others.

## 3. PixiJS

- [x] 3.1 Add a house layer to BoardScene for House markers; verify 0-4 markers and refresh without board regeneration and during movement.
- [x] 3.2 Add the rent payment step for Rent payment animation; verify a step only for a new `RentPaid` in an Update, none for Welcome, paid = 0 or malformed payloads, and ordering with other steps.

## 4. Mock

- [x] 4.1 Extend the dev mock script for rent payment, auto-payment at EndTurn, build, an illegal build and sell; verify a scripted mock test with decoded frames and `PROTOCOL_VERSION` fixtures.

## 5. Verification

- [ ] 5.1 Rebase on main after TASK-s4-server merges; run `pnpm build`, `pnpm test`, the client vite build, `openspec validate --all --strict`, `git diff --check`; compare the diff to every handoff criterion.
- [x] 5.2 Capture mock screenshots (settlement payer/other, asset card with quotes and controls and a disabled reason, house markers, rent animation) in `/srv/agents/evidence/TASK-s4-client/`.

## Workflow

- Report the proposal and wait for Team Lead approval before Apply.
- Push, open the PR, request the independent review, fix findings, archive this change in the PR, green CI on the final head.
