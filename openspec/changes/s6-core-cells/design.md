# Design

## Context

The accepted Team Lead design is `docs/efforts/stage-6-special-cells/design.md`. Its choices are binding: one landing dispatcher, integer percentage calculations, `core-8 → core-9` snapshot upgrading, a public casino decision, chance losses through `charge`/`settleDebt`, and the final jail fee settled before movement. This change adds no timer and does not alter stage 4–5 settlement semantics.

## Goals and Non-Goals

**Goals:** Implement the task handoff's C1–C12, C16, C18 and C19; maintain deterministic replay and integer money; preserve active rooms through state upgrade and restart; keep the client compiling and event descriptions current.

**Non-Goals:** Build special-cell dialogs or animations, add new browser scenarios, change accepted product rules, or change unrelated rent, liquidation or mortgage behavior.

## Decisions

1. **Dispatch landing effects centrally.** `landOn(state, playerId, diceSum)` handles all moves, including releases from jail and forced-fee moves. It delegates asset cells to the existing purchase/rent path, applies special-cell rules for casino, chance and go-to-jail, and leaves start and jail visits inert. Third-double jail continues to use the same jail-entry state and turn closure path.
2. **Keep chance and casino randomness in the core RNG.** Chance uses one `nextIntInclusive(rng, 0, 3)` draw mapped to the four accepted cards. Casino uses one `nextIntInclusive(rng, 0, 1)` draw with one as a win. Money uses integer multiplication followed by `Q`; no floating point is introduced.
3. **Reuse bank-charge settlement.** Negative chance cards open the existing `charge` slot through `openCharge`. On closure the existing mandatory settlement and `settleDebt` handle payment, liquidation and bank bankruptcy. No second debt implementation is added.
4. **Treat a casino offer as a turn-scoped decision.** The public state records `{playerId, turnId, cap}`. A bet or explicit decline clears it; `EndTurn` and `Timeout` auto-decline before settlement. A cap below the minimum bet still opens the offer and remains open until one of those close paths.
5. **Model final jail as an extension of the existing `JailEntry`.** `attemptsUsed` persists across turns. A jail roll attempts a double: a double releases and moves without a bonus; the first two failures stay in jail and permit own-turn actions; the third failure charges the bank before moving, and bankruptcy closes the turn without movement. Voluntary payment occurs before rolling and allows the next normal roll.
6. **Upgrade states in a pure version chain.** `upgradeState` recognizes genesis and current states, maps `core-7` through the existing `core-8` upgrade and then adds `casino: null`, and upgrades `core-8` directly to `core-9`. A prisoner keeps `attemptsUsed`. Snapshot loading continues to upgrade in memory before replay.
7. **Keep client changes descriptive.** Update protocol types and localized journal descriptions for the new public events; do not add decision controls or visual treatment assigned to `TASK-s6-client`.

## Risks and Trade-offs

- A move can produce both movement and special-cell settlement events; central dispatch and replay tests will pin deterministic event order.
- Forced jail fees reuse bank liquidation immediately before movement; focused tests will prove that bankruptcy does not move and that successful payment releases before landing dispatch.
- The seeded browser scenario may be sensitive to viewport restoration. The required ten-run check will establish whether the existing poll needs a root-cause fix; its timeout will not be lengthened.

## Migration Plan

1. Deploy core and server with `core-9` and the single protocol version bump.
2. On restore, upgrade older snapshots in memory and replay the log tail using the existing server recovery flow. A `core-8` prisoner retains attempts and adopts the final rules on their next action.
3. Do not rewrite snapshots at the same revision or add database migrations. The next regular snapshot persists the new state shape.
4. Keep the existing divergence behavior for old tails that do not replay under current rules; preserve log and snapshot rows and report the failed room.

## Open Questions

None within the accepted handoff and Team Lead design.
