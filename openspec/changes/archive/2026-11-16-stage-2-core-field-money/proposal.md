# Proposal

## Why

Stage 2 replaces the temporary movement ring with the accepted real board and introduces public balances. This core task supplies the deterministic state and event contracts required by the server and client sibling tasks.

Sources: ROADMAP.md stage 2; GAME-BREAKDOWN.md sections «Участники и поле», «Начальная настройка и деньги», «Движение, круг и награда»; docs/proposals/stage-2-asset-catalog.md; effort revision 1 and Team Lead design revision 1 in the TL-stage-2-design worktree; TASK-s2-core revision 1. Base: c31435312911c6cb622e26e4559b46ea8e39a327.

## What Changes

- **BREAKING**: support only core-4; remove PLACEHOLDER_RING and its types and markers, exporting CLASSIC_40 instead.
- Store the resolved board generated at CreateGame using ua-1, prices-1 and gen-1, with fixed layout and prices and seeded, entropy-dependent composition.
- Credit starting capital at StartGame, fix the lap reward, and credit forward crossings immediately after movement.
- Enforce board shape and public balance invariants; expose board, economy, balances and their events while keeping RNG secret.
- Extend deterministic data, movement, replay, restore and projection proof.

Out of scope: protocol version, server migration/recovery policy implementation, UI features, purchasing, rent, auctions, construction, mortgages, bankruptcy, casino/chance/Go-to-jail landing effects, final jail rules, trades and resignation money policy. Only mechanical client replacements necessary after deleting the old export are included.

## Capabilities

### New Capabilities

- `engine/board`: fixed layout, versioned catalog and prices, generation contract and board invariant.
- `engine/economy`: integer starting capital, lap reward, balance events and invariants.

### Modified Capabilities

- `engine/game-lifecycle`: creation generates board; core-4 gate; start credits capital before order rolls.
- `engine/turn-cycle`: real board movement and ordered crossing reward replace placeholder movement.
- `engine/projection`: explicit public state and event classifications for board and money.

## Impact

Primary changes are packages/game-core source and tests, with no new dependency. New exported contracts include CLASSIC_40, GeneratedBoard, BoardCell, BoardAsset, BoardGenerated and BalanceChanged (following existing event-type naming conventions as well). RNG draws at creation change all downstream golden streams. Existing session persistence already stores plain state/events and needs no core format adapter. Client import references in BoardCanvas.ts, client.ts, mock/game.ts and their boundary/layout/board tests require mechanical updates; no UI design belongs here.
