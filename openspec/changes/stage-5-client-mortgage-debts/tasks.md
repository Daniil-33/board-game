# Tasks

## 1. Mortgage presentation and commands

- [ ] 1.1 After Team Lead proposal approval, consume the server task's protocol v5 without editing protocol files; extend existing asset intent plumbing for Mortgage/Redeem (client/connection: Intents only). Verify both command payloads and turn targets through protocol decoders, rejected Ack display, unchanged state after accepted Ack and unchanged pending resend frames.
- [x] 1.2 Add game/mortgages.ts with exhaustive reason texts, shared-helper labels/legality and existing connection guards (client/game-screen: Mortgage controls). Verify all MortgageErrorCode messages, core-state/projected-view parity and disconnected/pending/deadline cases with focused tests; run client typecheck.
- [ ] 1.3 Extend AssetCard for mortgage actions, projected terms, pending player names and zero rent (client/game-screen: Mortgage controls, Projected mortgage terms, Asset inspection). Verify component tests for all asset kinds, own/other ownership, amounts, term refresh/removal, every disabled reason and open-rent Mortgage/Sell versus Redeem/Build; run client typecheck.

## 2. Debt notices

- [x] 2.1 Add one game/debts.ts presentation parser for accepted event payloads (client/game-screen: Public liquidation summary, Public bankruptcy notice). Verify ordered steps across every tier/kind, event-provided totals/payment, release matching, absent release and malformed payloads with focused tests; run client typecheck.
- [x] 2.2 Add one DebtNotices component for the parsed summaries (same spec sections). Verify component text for payer, creditor, debt, every step field, raised, payment, paid/writtenOff and freed assets; run client typecheck.
- [x] 2.3 Wire room-scoped notices into existing store/client callbacks and both playing/finished screens (same spec sections). Verify consecutive accepted updates retain notices, stale updates add none, room exit clears them and terminal animation cancellation cannot hide bankruptcy; run client typecheck.

## 3. Spectator, result and board

- [x] 3.1 Extend existing elimination HUD and GameOverScreen (client/game-screen: Confirmed resignation and spectator, Game over). Verify each elimination reason, continued read-only updates, result winner/order/reasons/times/final balances, remount from a finished view without events and absence of terminal game controls; run client typecheck.
- [x] 3.2 Extend existing BoardCanvas marker refresh (client/game-screen: Mortgage cell markers). Verify marker addition/removal on identical boards during queued animation, retaining owner/house markers; run client typecheck.
- [x] 3.3 Align stage 4 rent event spec/fixtures with amount and verify existing animation tests consume only valid RentPaid.amount (client/game-screen: Rent payment animation). All frame fixtures must import PROTOCOL_VERSION; run boundary tests.

## 4. Mock and acceptance evidence

- [ ] 4.1 Extend existing dev mock scripts/builders for mortgage, redeem, expiry, liquidation, bankruptcy and finish (all new client/game-screen sections). Verify scripted socket tests through protocol decoders and document mock invocation in existing client documentation or script comments; no literal protocol version.
- [ ] 4.2 Run the mock and capture screenshots for the required states to /srv/agents/evidence/TASK-s5-client/ without committing evidence. Verify screenshots demonstrate terms, notices, eliminated viewing and final result after reload.
- [ ] 4.3 Rebase after TASK-s5-server merges; run pnpm build, pnpm test, pnpm --filter @game/client build:bundle, openspec validate --all --strict and git diff --check over the committed base..HEAD range. Compare final diff against handoff criteria 1-11 and record concrete evidence with agentctl.

## Workflow follow-up

- Commit and push agent/task-s5-client, create the PR using agentctl external-operation intent/verify/confirm records, and start independent review using the required engineer-to-reviewer template.
- Resolve review findings, verify all CI jobs on the exact final head, archive this change in the PR after independent review passes, and rerun relevant validation after archival.
- Report residual risks and await Team Lead acceptance; never merge the PR as Engineer.
