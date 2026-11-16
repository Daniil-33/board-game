# Design

## Context

See proposal.md for motivation and the client/game-screen delta for behavior. The branch starts at b92ebb7 (merged stage 2 core). StateView already includes board, balances and economy. BoardScene currently draws static placeholder cells; GameScreen mounts it via an injected BoardMount, while createClient synchronizes animations and views. MockGame and shared fixtures currently leave board null and balances empty. The accepted effort design is available in the TL-stage-2-design worktree; it is not yet present at this branch's source commit.

## Goals / Non-Goals

Goals: display the existing projection without economic logic, keep all current animation and lifecycle behavior, and make Pixi selection testable without WebGL.

Non-goals: change network/view contracts, implement asset actions, calculate money in production, introduce dependencies or redesign the board geometry.

## Decisions

- Add a pure display mapping for projected BoardCell labels, group marker colors/text and price text. M1..M8, logistics and energy get distinct colors and explicit group text. Keep the 11-per-side geometry; constrain and wrap/truncate labels within cell bounds. Prefer this over copying catalog or price tables into UI.
- Extend BoardView with board data. BoardScene renders that supplied board and rebuilds cell content only when needed, leaving token identity and animation behavior intact. Remove the placeholder caption; retain the jail box, dice and token layers.
- Carry cell selection through a local optional board callback registration, wired and cleared by GameScreen around mount/unmount. Only asset cells activate selection. Selection is a cell index, with details derived from the latest view so stale asset objects cannot survive board replacement. This is a UI adapter change, not a server-view contract change.
- Add PlayerPanel and AssetCard Vue components. PlayerPanel reads all view.players, balances and active/eliminated status, resolving nicknames through the existing member map. It updates reactively from views independently of animation. Retain existing HUD order/setup indicators. AssetCard filters current board cells by groupId, excludes the selected asset and lists cell indices explicitly; close control and Escape clear selection and listeners are cleaned up on unmount. No optional reward hint in this task.
- Generate deterministic stage 2 boards for tests and dev mock using game-core's generator. Dev-only mock may use core money helpers to produce realistic starting balance and lap-reward views/events; no generator or economic helper enters production UI. Network frames continue through existing protocol decoders.

## Risks / Trade-offs

- Narrow cells and long catalog names → bounded text wrapping/truncation plus actual browser screenshot review at the standard canvas size; full names remain available in asset cards.
- Board selection listener lifetime → test mounting/unmounting and clear callback on teardown.
- Server protocol bump runs in parallel → do not edit packages/protocol. Production and fixtures follow PROTOCOL_VERSION. Per the Team Lead client-first decision (2026-11-16), this PR merges first; TASK-s2-server rebases onto main after it and runs the client tests against v2. This supersedes the earlier server-first Apply dependency gate.
- Mock differs from authoritative engine → use core-generated data and focused fixture assertions; end-to-end authoritative scenarios remain TASK-s2-e2e.

## Migration Plan

No persisted-data migration. Reconcile current main before the final PR head (rebase only if it moved from b92ebb7), run all required checks, and submit only client and OpenSpec changes. Rollback is reverting the client PR. Archive the delta in the PR after independent review passes, as the task requires.
