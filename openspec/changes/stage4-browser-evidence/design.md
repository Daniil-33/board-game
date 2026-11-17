## Context
Approved TASK-s4-e2e revision 1 and scope extension permit test-only fixture changes. Rules remain those of GAME-BREAKDOWN § «Активы, рента и строительство» and accepted stage 4 specs.

## Goals / Non-Goals
Prove AC1–8 through three browser clients and real server dice, plus regression suites and CI. Do not change product rules, loader, environment guards or persistence.

## Decisions
- Named pre-roll genesis fixtures choose ownership and positions near target cells; bounded retries create fresh fixture rooms if the real roll misses. No dice seeds or forged roll events.
- Energy assertions compare the settlement, visible sum, and actual DiceRolled dice. Expected money is calculated independently from projected board prices.
- Bonus-turn evidence retries fresh pre-roll fixtures until a real double; build in the double’s turn, then prove a fresh quota on the resulting bonus turn.
- Keep open-rent genesis for reload/restart and deadline evidence. Use the real turn deadline and all three reconnects.
- Isolate fixtures in their own Compose project/volume and override, never staging or production. Earlier suites keep their stacks and source unchanged.
- Reuse existing trace sanitizers; evidence remains outside Git.

## Risks
Real dice retries are bounded and can fail with an explicit diagnostic. Deadline work must finish with a measured margin before timeout. Browser job stays under 35 minutes; report if above 25.

## Verification
Fixture integration tests exercise real RollDice over three sockets; browser assertions inspect every projected view, public events and visible controls. Run build, unit/integration, e2e typecheck, strict OpenSpec validation, unchanged production/seeded suites, fixture Compose suite and all PR CI jobs.
