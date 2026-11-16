# Proposal

## Why
Ownership currently yields no income and the build quota is unused. Stage 4 makes rent and houses executable under the accepted GAME-BREAKDOWN.md sections “Активы, рента и строительство” and “Ипотека и расчёт долгов” (house sale refund only).

## What Changes
- **BREAKING**: support only core-6; add houses and rent settlement state.
- Calculate all three rent families with integer arithmetic and mortgage hooks.
- Settle rent explicitly or at turn closure, including interim shortfall.
- Add build/sell commands, shared legality helpers, evenness and full-turn quota.
- Publish rent quotes, houses, settlement and related events.
- Isolate provisional resignation defaults R1/R2; merge remains gated on ROADMAP.md recording the CTO answer.

## Capabilities
### New Capabilities
- `engine/rent-building`: rent formulas, landing settlements, building, selling, mortgage hooks and public quote helpers.
### Modified Capabilities
- `engine/projection`: public houses, rent, computed rentQuotes and new events.
- `engine/turn-cycle`: bonus turns inherit the remaining build quota.

## Impact
Changes packages/game-core source and tests and this OpenSpec change. Mechanical type fixture repairs outside core are allowed and must be reported individually. No new dependencies.

Out of scope: protocol version/migrations, server/client implementation, mortgage execution, debt, bankruptcy, liquidation, casino, chance, final jail and trades. Sources: TASK-s4-core revision 1; stage-4 handoff revision 1 on docs/stage-4-handoff; Team Lead design on docs/stage-4-tl-design; base 6a60bdc.
