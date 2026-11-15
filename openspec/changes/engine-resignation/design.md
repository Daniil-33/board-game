# Design

## Context

See proposal.md for motivation and published host names. The core at e30d40a implements `engine-turn-cycle`, whose deltas have not yet been synced to main specs. `registry.ts` checks type, expectation, actor, membership, phase, then handler; it absorbs entropy only into a temporary working state and commits one revision on acceptance. No envelope change is needed.

Setup stores ranked groups plus the current group's pending and recorded rolls. `turns.ts` already centralizes opening and closing turns. `pendingDeadlines` derives targets from setup/turn state; session replay and restoration already preserve commands, entropy and events.

## Goals / Non-Goals

**Goals:** preserve surviving progress and existing target identity when possible; make cleanup atomic with resignation; provide explicit finished-state invariants and host-visible events.

**Non-Goals:** a general elimination/economy framework, changing command validation precedence, or adding a new concurrency guard.

## Decisions

### D1. Retain participants, track elimination separately

Add `eliminated: readonly PlayerId[]` and `winner: PlayerId | null` with genesis defaults `[]` and `null`. Active ids are derived from `players` minus `eliminated`. Both new keys are public. Retaining participants preserves identity and projection membership across resignation; deleting participants would lose that distinction. An array avoids another player-keyed record and preserves deterministic resignation order.

In setup/playing there must be at least two active participants. In finished exactly one remains and matches winner. `order` and `turn` exist only in playing; setup only in setup. Playing positions name exactly active participants. Finished retains any winner position/jail entry from playing, but setup victory creates none. All eliminated positions/jail entries are absent. These choices keep the final board useful without manufacturing a setup board.

### D2. Revision guards for leave and resign

Use existing revisionGuard for both commands. Resign is not tied to an owned timed target and must work for any active participant after deadline; target guards would impose unrelated timing identity. Two serial resignation requests from one revision may require the second caller to retry with the fresh revision. This is normal optimistic concurrency, not simultaneous resignation semantics.

LeaveLobby validates a non-empty string playerId, then membership. Resign validates null, then that actor is not already eliminated. Existing envelope errors and ordering are preserved. Existing turn/order-roll handlers already deny eliminated players because they cannot own a current target; test that explicitly. Session deduplication remains before execution and may return an earlier acceptance after finish without making a transition.

### D3. One bounded resignation coordinator

Add `resignation.ts` for Resign command/event types and coordination; keep LeaveLobby in lifecycle.ts. Register Resign in rules.ts and export types in index.ts. Reuse small pure setup/turn helpers rather than copying state-machine logic into the coordinator. No helper should import the coordinator, avoiding cycles.

Own-key-safe record removal uses own entries/filtering or a copied object plus delete, never prototype-sensitive membership or assignment. Exercise `__proto__`, `constructor`, and `toString` through setup rolls, positions, jail cleanup and projection.

### D4. Turn closure and event order

Find the cyclic successor in the pre-removal order before filtering the resigning owner. Extend the existing turn-close path to reason `resigned` and suppress pending bonus. Allow closure without starting a turn when victory follows. Keep settlement as the existing stage 1 no-op; no economy effects.

Events start with PlayerResigned. If the resigning player owns the turn, append TurnEnded. Then append GameEnded when one survivor remains; otherwise append TurnStarted for the successor. For another player's resignation, preserve the entire current turn object unless victory clears it. In that victory case do not emit a fabricated resignation TurnEnded for the surviving owner.

### D5. Setup removal algorithm

Remove the id from all groups, current pending ids and own recorded results, discard empty groups, and remap the current group index. Preserve survivor values and relative order. If the current group is still unresolved and has pending survivors, continue its round; if all have rolled, split by surviving values using the existing descending/stable grouping logic. A singleton is resolved without another roll, including a singleton whose roll was still pending. When that round is resolved, select the first remaining unresolved group or begin play in groups.flat() order.

Factor round completion/advancement from the existing roll handler so removal cannot diverge from normal ranking. If the current roller stays the same, retain setupRollId and deadline even when group indices shift. If a different roller becomes current, use the existing revision-derived fresh id and now + 45000 deadline. Finishing bypasses setup advancement entirely. Never draw dice during resignation; accepted entropy absorption still follows the existing engine contract.

Alternative: restart the whole setup round. Rejected because it discards surviving results and changes established progress. Alternative: leave singleton groups pending. Rejected because their order is already resolved.

### D6. Deadlines, finished and versioning

Clear setup, order and turn on victory; pendingDeadlines already returns [] outside setup/playing. Removed targets therefore fail Timeout's existing target guard before phase checking. Unchanged targets remain valid after an unrelated resignation; tests must distinguish these from stale targets. Fresh targets continue using s/t plus the accepting revision, never reusing an id.

Support only core-3 in this engine, following the core-1 to core-2 precedent. Update fixtures and golden expectations inside game-core. No old snapshot/log migration or cross-package compatibility shim is included. Replay of old versions requires their original engine.

### D7. Proof strategy

Scenario tests cover lobby removal to empty and start limits; malformed payloads, actors, guards and repeated resignation; own/unowned turns before roll, after a double and during continuation; jail cleanup; setup removal before/after recorded rolls, tie rounds, singleton collapse, group-index shifts and play transition; victory from setup and both turn-ownership cases. Test resignation before, at and after deadlines and stale Timeout target rejection with unchanged state/RNG.

Extend seeded replay/property generation with LeaveLobby and Resign, retaining long turn-only runs so jail/doubles coverage does not disappear when games end early. Add positive coverage assertions for both new commands and finished states. Test snapshot splits before and after resignation and a tail ending in victory; compare full state, RNG, events and pending deadlines. Projection tests cover new fields/events for every viewer category, plus detached copies. Invariant defect tests reject resurrected positions/turns and invalid winners.

## Risks / Trade-offs

- [Unsynced engine-turn-cycle deltas overlap lifecycle/invariant/projection requirements] → this change explicitly builds on them; Team Lead integration must sync turn-cycle before resignation. Team Lead approved syncing/archiving engine-turn-cycle as the first Apply commit; engine-resignation remains active.
- [Setup removal has several partial-round cases] → share advancement logic and pin seeded three-to-six-player cases rather than restarting rolls.
- [core-3 affects parallel consumer fixtures] → publish names/version now; Team Lead approved current-version constant substitutions in the six named server/client test fixtures. Other consumer changes require Team Lead authorization.
- [Revision guards can reject an otherwise timely resignation after unrelated progress] → retry with the current revision; no deadline restriction applies.

## Migration Plan

Team Lead approves these artifacts, then Apply starts in a fresh Engineer context. Implement and verify on agent/task-s1-core-resign, rebase on current main before the PR, and obtain exact-head CI and independent review. Only new core-3 games use this engine. Rollback restores the previous engine for core-2 games; core-3 logs require core-3. After merge, archive/sync in dependency order under Team Lead coordination.
