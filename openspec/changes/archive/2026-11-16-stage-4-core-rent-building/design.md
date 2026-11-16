# Design

## Context
Base 6a60bdc already centralizes closeTurn, has an empty settleMandatory hook and stores turn.quotas.builds. offerPurchase is called after ordinary movement and every jail attempt. StateView currently copies public state fields and has no computed fields. See proposal.md for motivation. Contract follows TASK-s4-core revision 1 and the Team Lead stage-4 design exactly.

## Goals / Non-Goals
Implement deterministic core behavior and client-safe helpers. Preserve existing guards, revision handling, entropy mixing and purchase/auction orchestration. Do not add a rent timer or change protocol/server/client behavior.

## Decisions
- Add rent.ts for rentFor, energyRentFor, isMortgaged, quotes, landing settlement, settleRent and isolated resignDuringRent; add houses.ts for legality and commands. Separate pure economy helpers from turn orchestration to avoid circular turn callbacks. Alternative: put everything in turns.ts; rejected because display helpers must be reusable.
- Use exact integer numerators and denominators, quantizing as 10×floor(numerator/(10×denominator)). All prices-1 intermediates fit safe integers. Double the quantized base, not the unrounded percentage. No intermediate rounded energy mean.
- Preserve the exact GameState houses/rent shapes and command payloads from the Team Lead design. Export RentSettlement, RentQuote, commands, events and helper types through index.ts. Helpers return a condition code or null for legal; shared helpers accept authoritative GameState. No wall-clock check in display legality: handlers check auction pause, turn ownership, then TransitionContext.now before calling legality helpers, matching checkOwnerInTime; paused turns return AUCTION_IN_PROGRESS and expired unpaused owner commands return DEADLINE_PASSED.
- House condition codes: PHASE_NOT_ALLOWED, NOT_ACTIVE_PLAYER, DECISION_PENDING, AUCTION_IN_PROGRESS, RENT_PENDING, NOT_A_BUILDABLE_ASSET, NOT_OWNER, GROUP_INCOMPLETE, GROUP_MORTGAGED, MAX_HOUSES, UNEVEN_BUILD, BUILD_QUOTA_USED, INSUFFICIENT_FUNDS, NO_HOUSES, UNEVEN_SALE. Envelope guards and malformed payload rejection retain existing conventions. PayRent adds NO_RENT for an absent settlement.
- Land only after actual forward movement, preserving purchase priority. A failed jail attempt must not charge rent at the unchanged position. Use the move dice sum directly, not inferred position differences.
- settleMandatory invokes settleRent(auto=true). Explicit PayRent uses auto=false. Emit payer debit and owner credit only for paid>0; at zero balance emit only RentPaid.
- Bonus start copies the closing turn's remaining builds, while offers retain their existing reset. Full turns reset both. Selling never replenishes builds.
- Call resignDuringRent before closure and before any terminal branch, so R1/R2 cannot accidentally auto-pay through closeTurn. Unrelated departures preserve rent unless terminal cleanup is required. Defaults remain isolated pending the ROADMAP merge gate.
- Add rentQuotes as a derived StateView field; keep houses and rent explicitly public. Use rentFor for fixed quotes and shared energyRentFor for energy evaluation. Resigned owners and mortgaged landed assets quote fixed zero. Public events extend CoreEvent and EVENT_VISIBILITY.
- Extend invariants with owned whole monopoly groups, house count spread, rent phase/payer/exclusivity/positive quantum and build quota bounds. Keep houses after resignation, consistent with ownership remaining until stage 5.

## Risks / Trade-offs
- Stage 4 shortfall intentionally writes off the remainder: prove amount/paid/shortfall separately so stage 5 can replace settlement policy.
- core-6 changes accepted-command entropy and fixtures: replay tests and seeded Compose scenario must be checked; re-pin test data only if needed and report each outside-core repair.
- ROADMAP lacks R: implement only the expressly delegated defaults; do not merge until the CTO answer is durable. A different answer changes resignDuringRent and tests.
- Main evolves concurrently: rebase before PR, rerun required checks and review the exact final head.

## Migration Plan
Only core-6 is supported. Stored-game migration and protocol rollout belong to sibling tasks. No external operation in the proposal checkpoint; implementation starts only after Team Lead acceptance in a fresh context.
