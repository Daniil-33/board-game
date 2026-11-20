# Proposal

## Why

The accepted stage 6 rules replace the temporary jail rule and add the final effects for casino, chance and go-to-jail cells. These transitions must remain deterministic, use the existing bank-charge settlement path, expose the new decision and event data through the protocol, and keep stored `core-8` games recoverable.

## What Changes

- Add one `landOn` dispatcher for every player move, preserving asset purchase/rent behavior and applying casino, chance, go-to-jail, start and jail effects as specified by the stage 6 handoff.
- Add casino offer, bet, decline and automatic-decline transitions; add deterministic chance draws and route losses through the existing bank charge.
- Replace prior jail attempts with final jail release, attempt, voluntary fee and forced third-failure fee transitions, including mandatory settlement before movement.
- Remove prior jail runtime types, events, exports, protocol text and client text. Preserve each prisoner's `attemptsUsed`.
- Bump rules to `core-9`, extend the `core-7 → core-8 → core-9` pure state upgrade chain, add the public casino projection and protocol commands/events, and bump the protocol version once.
- Cover recovery for active casino and charge decisions, prisoners, mortgage redeem locks, `core-8` snapshots, genesis snapshots and the carried recovery assertions.
- Update the seeded jail browser scenario to assert the final `JailAttemptFailed` event and investigate the known journal layout flake with ten local seeded runs.

Out of scope: casino/chance/jail UI dialogs or animations, new stage 6 browser scenarios, client layout work, and changes to stage 4–5 rent, liquidation or mortgage semantics.

## Capabilities

### New Capabilities

- `engine/special-cells`: dispatcher, casino, chance and final jail effects on `CLASSIC_40`.

### Modified Capabilities

- `engine/turn-cycle`: all moves dispatch landing effects and jail-specific turn behavior.
- `engine/special-cells`: add the final jail state machine and special-cell effects; the prior jail capability is retired.
- `engine/game-lifecycle`: make `core-9` current and chain state upgrades through `core-8`.
- `engine/projection`: project casino state and classify all new events as public.
- `protocol/frames`: add commands, event payloads and `core-9` state fields; bump `PROTOCOL_VERSION` once.
- `server/recovery`: restore active special-cell state and cover core-8, genesis and divergence behavior.

## Impact

Affected areas: `packages/game-core` turn, cell, jail, money, lifecycle, invariant, projection and export modules; `packages/protocol` schemas; server recovery integration tests; client compilation and journal event descriptions/locales; and the seeded jail scenario in `e2e/compose.spec.ts`. No database schema change is expected.

## Canonical Product References

- `ROADMAP.md`, stage 6 “Особые клетки”.
- `GAME-BREAKDOWN.md`, “Особые клетки и события” and final jail decisions.
- `docs/efforts/stage-6-special-cells.md`, revision 1, criteria C1–C12, C16, C18 and C19.
- `docs/efforts/stage-6-special-cells/design.md`, “Landing effects”, “Jail”, “Projection” and “Versions and stored games”.
