import { expect, it } from 'vitest';
import { pendingDeadlines, projectState } from '@game/game-core';
import { logEntries, seedRoom } from './helpers/db.js';
import { byPlayer, ok, playingGame, step, whenIdle } from './helpers/game.js';
import { useHarness } from './helpers/harness.js';

const h = useHarness({ perTest: true });

async function decision() {
  const first = h.manager();
  const id = await seedRoom(h.db);
  const room = await first.manager.open(id);
  await playingGame(room, ['a', 'b', 'c']);
  for (let i = 0; i < 100 && !room.state.purchase; i++) await step(room);
  expect(room.state.purchase).not.toBeNull();
  return { first, id, room };
}

// spec: server/recovery "Stage 3 recovery equality"
it.each(['decision', 'auction'])('crash-style snapshot plus tail exactly restores %s without a shutdown snapshot', async phase => {
  const { first, id, room } = await decision();
  if (phase === 'auction') {
    first.clock.advance(1234);
    await ok(room, byPlayer('StartAuction', room.state.turn!.playerId, { kind: 'turn', id: room.state.turn!.turnId }));
    await ok(room, byPlayer('Bid', room.state.auction!.responder, { kind: 'auctionResponse', id: room.state.auction!.responseId }));
  }
  const before = room.state;
  const loaded = await first.store.loadGame(id);
  expect(loaded.snapshot).not.toBeNull();
  expect(loaded.snapshot!.purchase).toBeNull();
  expect(loaded.snapshot!.auction).toBeNull();
  expect(loaded.tail.some(e => e.events.some(event => event.type === (phase === 'decision' ? 'PurchaseOffered' : 'AuctionStarted')))).toBe(true);
  const second = h.manager({ now: first.clock.now(), seed: 2 });
  expect(await second.manager.restoreAll()).toEqual({ restored: [id], failed: [] });
  const recovered = second.manager.get(id)!;
  expect(recovered.state).toEqual(before);
  for (const player of before.players) expect(projectState(recovered.state, { kind: 'player', id: player.id })).toEqual(projectState(before, { kind: 'player', id: player.id }));
  expect(second.clock.pending).toEqual(pendingDeadlines(before).map(d => d.at));
  expect(await second.store.loadGame(id)).toEqual(loaded);
});

// spec: server/timers "Overdue response at boot"
it('boot persists an overdue response pass without advancing time, then arms the next response', async () => {
  const { first, id, room } = await decision();
  await ok(room, byPlayer('StartAuction', room.state.turn!.playerId, { kind: 'turn', id: room.state.turn!.turnId }));
  await ok(room, byPlayer('Bid', room.state.auction!.responder, { kind: 'auctionResponse', id: room.state.auction!.responseId }));
  const before = room.state;
  const response = before.auction!;
  const now = response.responseDeadline + 1;
  // Keep the first manager alive to avoid a shutdown snapshot; its fake clock never advances.
  const second = h.manager({ now });
  expect(await second.manager.restoreAll()).toEqual({ restored: [id], failed: [] });
  const restored = second.manager.get(id)!;
  await whenIdle(restored);
  expect(second.clock.now()).toBe(now);
  expect(restored.state.revision).toBe(before.revision + 1);
  expect(restored.state.auction!.passed).toContain(response.responder);
  expect(restored.state.auction!.responseId).not.toBe(response.responseId);
  expect(restored.state.auction!.leader).toBe(response.leader);
  expect(restored.state.turn!.pausedRemainingMs).toBe(before.turn!.pausedRemainingMs);
  expect(restored.state.balances).toEqual(before.balances);
  expect(restored.state.owners).toEqual(before.owners);
  const entry = (await logEntries(h.db, id)).at(-1)!;
  expect(entry.now).toBe(now);
  expect(entry.command).toMatchObject({ type: 'Timeout', actor: { kind: 'system' }, expected: { kind: 'target', target: { kind: 'auctionResponse', id: response.responseId } } });
  expect(entry.events[0]).toMatchObject({ type: 'AuctionPassed', payload: { playerId: response.responder, auto: true } });
  expect(second.clock.pending).toEqual([now + 10_000]);
  expect(second.clock.pending).toEqual(pendingDeadlines(restored.state).map(d => d.at));
  expect(room.state).toEqual(before);
});
