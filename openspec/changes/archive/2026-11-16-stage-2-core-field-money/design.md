# Design

## Context

See proposal.md for scope and sources. The clean task branch starts at c314353. Existing board.ts combines a temporary layout and movement; lifecycle.ts seeds at CreateGame and starts order rolls at StartGame; registry.ts absorbs context entropy only when an RNG already exists. invariants.ts validates accepted states; projection.ts classifies every field/event and returns detached JSON data. Session logs and snapshots already retain the entire state and events.

The Team Lead design lives at /srv/agents/worktrees/economic-board-game/TL-stage-2-design/docs/efforts/stage-2-field-money/design.md (revision 1), alongside the task handoff. It is not yet present in this task's base checkout. Its state shape, exported names, events and generator algorithm are mandatory; this change records their core portion so a fresh Apply session has complete context.

## Goals / Non-Goals

Goals: preserve the accepted deterministic transition boundary and downstream exports; implement engine/board and engine/economy with focused proof alongside changes.

Non-goals: no second rules engine for older games, infrastructure adapters, protocol changes or money rules beyond the accepted credits. Sibling tasks own stored core-3 room closure and functional UI.

## Decisions

### Data and module boundaries

Replace static placeholder definitions with board/classic40.ts exporting frozen CLASSIC_40 { size: 40, startCell: 0, jailCell: 10, cells }. Kinds are start, jail, casino, go-to-jail, chance, monopoly, logistics, energy; static monopoly cells carry rank. Layout indices are exactly the proposal, not inferred from a Monopoly template.

Add board/prices.ts with PRICE_TABLE version prices-1, rank position arrays, logistics 1780, energy 1330 and S=56740. Store integer literals, not a geometric formula. Add catalog/ua-1.json with { version, categories: [{ id, name, companies: [{ id, name }] }], logistics, energy }; catalog.ts validates the imported data. Preserve all names and ordering from the proposal. Use ASCII ids with category/company prefixes to ensure global uniqueness. No new dependency is needed; verify JSON module compatibility in the existing TypeScript build.

Keep board.ts as the movement facade and re-export types/data for callers; put generation in board/generate.ts. Alternatives of a single growing board module or storing only catalog ids would either obscure the fixed draw contract or make persisted games dependent on future catalog edits.

### Required state and export contract

Add exactly these fields to GameState and genesis:

```ts
board: GeneratedBoard | null;
economy: { readonly startingCapital: Money; readonly lapReward: Money } | null;
balances: Readonly<Record<string, Money>>;
```

GeneratedBoard has layout 'CLASSIC_40', catalogVersion, priceTableVersion, generatorVersion and readonly cells. Each BoardCell has index, kind and asset: BoardAsset | null. BoardAsset has assetId: AssetId (company id), name, categoryId, categoryName, groupId, rank: number | null, price: Money. Monopoly groupIds are M1..M8; logistics and energy use their literal group ids and category ids. Preserve the exported names CLASSIC_40, GeneratedBoard, BoardCell, BoardAsset, BoardGenerated and BalanceChanged, with event aliases consistent with existing *Event types where useful. CURRENT_RULES_VERSION becomes core-4 and is the sole supported version.

### gen-1 and entropy

After validating CreateGame payload and version, use absorbEntropy(seedRng(seed), context.entropy). The registry cannot do this for genesis because genesis.rng is null. Do not absorb a second time. Thread this RNG through the generator and return the consumed RNG along with the resolved board.

Fisher–Yates copies the input and iterates i=n-1..1, drawing nextIntInclusive(rng,0,i) and swapping. Full shuffle order is: all ten category entries in catalog order, take first eight for ranks 1..8; for each selected category in rank order shuffle all its companies in catalog order and take the required size; shuffle all six logistics and take four; shuffle all four energy and take two. Assign each subset in ascending cell index. No category sorting, partial shuffle, per-cell draw or extra draw is allowed. Reuse the existing pure RNG with rejection sampling. This preserves the Team Lead algorithm rather than selecting a different sampling strategy.

Creation emits GameCreated then BoardGenerated { layout, catalogVersion, priceTableVersion, generatorVersion }. Persist the fully resolved board once; project copies rather than references.

### Money and movement

Extend money.ts with startingCapital(N) = 10 * floor(600 * 56740 / (569 * N * 10)) and lapReward(C) = 10 * floor(2 * C / 150). Inputs and intermediate integer numerators are safely bounded; avoid floating point monetary formulas. Set economy at StartGame, credit each participant in join order and emit GameStarted, BalanceChanged credits, then existing order-roll events.

Use a shared pure balance-credit helper in money.ts, returning new balances and BalanceChanged { playerId, delta, balance, reason }. Construct own-property dictionaries safely for ids such as __proto__ and constructor; preserve the existing player-id safety tests. All balances survive resignation, including a game ending during setup.

Change internal movePlayer to return an ordered event list so both normal movement and interim jail release propagate PlayerMoved then optional BalanceChanged. Compare from + steps >= CLASSIC_40.size for the accepted 2d6 forward moves. The existing third-double branch bypasses movePlayer and pays nothing. Preserve event ordering through manual and automatic roll paths. Settlement remains inert; no backward/multi-lap movement command is introduced.

### Invariants and projection

Add board-shape and balances invariant names and raise InvariantViolationError for violations. Validate board presence, every layout cell and asset nullability, rank/group/category consistency, fixed prices, unique asset ids and distinct categories. Validate exact participant balance keys in setup/playing/finished, absence beforehand, non-negative safe quanta and economy presence. Use CLASSIC_40.size for positions.

Classify board/economy/balances as public and both new events as public; add them to the event union. Keep rng secret. Existing copy semantics and fail-closed classification remain.

### Compatibility edits and verification

Mechanically replace the removed ring export in apps/client/src/board/BoardCanvas.ts, src/client.ts, mock/game.ts and client boundary/layout/board tests. New state fields may require fixture-only updates where typechecking fails; report exact files, and escalate if functional UI or protocol work becomes necessary. No new UI behavior belongs in these edits.

Pin a golden resolved board and post-generation RNG for a fixed seed and entropy; test changed seed and changed entropy separately. Across deterministic many-seed samples, assert board-shape on each board and coverage of every category and company. This is deterministic distribution sanity, not a probabilistic claim of uniformity.

Data tests independently pin proposal names, ordering, indices, counts, exact price arrays and total; test all C(N) and rewards. Movement tests cover from 39/35/30 and other boundary cells with steps 2..12, exact start, no crossing, manual/automatic third doubles and interim release. Replay and restore compare complete state, events, board and balances; update core-4 golden fixtures, test version gates and rejection purity. Projection tests exercise all viewer classes and detached copies.

## Risks / Trade-offs

- Creation consumes RNG and changes later dice streams → update golden fixtures with explicit board and event evidence, retain broad replay/property coverage and use existing dice-search helpers.
- Names/order drift silently changes gen-1 → pin data against the proposal, golden board and RNG, without Unicode normalization.
- Imported JSON or readonly shapes affect declaration output → package typecheck during implementation and full monorepo build.
- Removed export has client references → bounded mechanical replacement list above; report edits.
- Catalog data changing later could alter replay → immutable ua-1 data and explicit version fields; changing algorithm/order requires new versions and Team Lead approval.

## Migration Plan

This task accepts only core-4. It does not migrate old sessions or operate on databases; the sibling server task implements the Team Lead's core-3 failed-room/closure policy. Work remains on agent/task-s2-core. After approval, a fresh Apply session implements and verifies; open a PR using recorded external-operation intent/result, obtain independent review and green exact-head CI. Archive/sync this change in the PR after review passes, then recheck the final head. No deployment in this task.

## Approved fixture scope extension

The Team Lead approved test-data-only changes to the existing shared seeded scenario in apps/server/src/__tests__/compose-fixture.test.ts, docker-compose.e2e.yml and e2e/compose.spec.ts after the core-4 RNG change invalidated seed 1036. Search ascending seeds with the actual createServerContext stream and complete accepted-command flow; retain a setup tie, three consecutive doubles sending the player to jail before movement, and the following interim jail attempt. Seed 4491 is the first match: four setup rolls, a rolls [4,4], [3,3], [1,1] and is jailed; b rolls [3,6], then a attempts [4,2] and remains jailed with one attempt used. Only seeds and pinned expected values change in these three files; all browser flow and scenario assertions remain. Any other compose-browser failure returns to the Team Lead before changes.
