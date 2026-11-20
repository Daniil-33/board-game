import { afterEach, expect, it } from 'vitest';
import { CURRENT_RULES_VERSION, createSession, entropy, gameEngine, timestamp, type GameState } from '@game/game-core';
import { sql } from 'kysely';
import { buildFixture } from '../test-fixtures.js';
import { useHarness } from './helpers/harness.js';
import { byPlayer, T0 } from './helpers/game.js';
import { logEntries, seedRoom, snapshotRevisions } from './helpers/db.js';
import { stopServers } from './helpers/server.js';

const h = useHarness({ perTest: true });
afterEach(stopServers);

async function insertOldSnapshot(id: string): Promise<{ legacy: GameState; current: GameState }> {
  const current = buildFixture('mortgage-restart', ['legacy-a', 'legacy-b', 'legacy-c'], T0);
  const raw = JSON.parse(JSON.stringify(current)) as Record<string, any>;
  raw.rulesVersion = 'core-7';
  delete raw.charge;
  raw.jail = { ...raw.jail, [raw.turn.playerId]: { attemptsUsed: 1 } };
  for (const mortgage of Object.values(raw.mortgages) as Record<string, any>[]) delete mortgage.lockedTurnId;
  const legacy = raw as GameState;
  await h.db.updateTable('rooms').set({ status: 'playing' }).where('id', '=', id).execute();
  await h.db.insertInto('game_snapshots').values({ game_id: id, revision: legacy.revision,
    state: sql`${JSON.stringify(legacy)}::jsonb` }).execute();
  return { legacy, current };
}

const storedRows = async (id: string) => ({
  room: await h.db.selectFrom('rooms').selectAll().where('id', '=', id).execute(),
  members: await h.db.selectFrom('room_members').selectAll().where('room_id', '=', id).execute(),
  logs: await h.db.selectFrom('game_log').selectAll().where('game_id', '=', id).orderBy('revision').execute(),
  snapshots: await h.db.selectFrom('game_snapshots').selectAll().where('game_id', '=', id).orderBy('revision').execute(),
});

it('upgrades a core-7 prisoner and mortgage in memory, then replays a new tail without shutdown snapshot', async () => {
  const id = await seedRoom(h.db);
  const { legacy } = await insertOldSnapshot(id);
  const first = h.manager();
  const live = await first.manager.open(id);
  expect(live.state.rulesVersion).toBe('core-8');
  expect(live.state.charge).toBeNull();
  expect(live.state.jail).toEqual(legacy.jail);
  expect(Object.values(live.state.mortgages).every(term => term.lockedTurnId === null)).toBe(true);
  expect(await h.db.selectFrom('game_snapshots').selectAll().where('game_id', '=', id).executeTakeFirstOrThrow()).toMatchObject({ state: legacy });

  const before = live.state;
  const accepted = await live.submit(byPlayer('EndTurn', before.turn!.playerId, { kind: 'turn', id: before.turn!.turnId }));
  expect(accepted.kind).toBe('accepted');
  const liveAfterTail = live.state;
  expect(await snapshotRevisions(h.db, id)).toEqual([legacy.revision]);
  expect((await logEntries(h.db, id)).at(-1)!.revision).toBe(liveAfterTail.revision);

  // Simulated crash: restore through a new manager before the first manager can snapshot.
  const second = h.manager();
  expect(await second.manager.restoreAll()).toEqual({ restored: [id], failed: [] });
  expect(second.manager.get(id)!.state).toEqual(liveAfterTail);
  expect(await snapshotRevisions(h.db, id)).toEqual([legacy.revision]);
  expect((await storedRows(id)).snapshots[0]!.state).toEqual(legacy);
});

it('fails and logs a core-7 log-only game from genesis without changing any rows', async () => {
  const id = await seedRoom(h.db);
  await h.db.updateTable('rooms').set({ status: 'playing' }).where('id', '=', id).execute();
  const session = createSession(gameEngine);
  const command = { type: 'CreateGame', commandId: 'old-create' as never, actor: { kind: 'system' as const },
    expected: { kind: 'revision' as const, revision: 0 as never }, payload: { seed: 42, rulesVersion: CURRENT_RULES_VERSION } };
  const created = session.submit(command, { now: timestamp(T0), entropy: entropy([1, 2, 3, 4]) });
  expect(created.kind).toBe('accepted');
  const core8Entry = session.log[0]!;
  const oldEntry = { ...core8Entry, command: { ...core8Entry.command, payload: { seed: 42, rulesVersion: 'core-7' } } };
  await h.db.insertInto('game_log').values({ game_id: id, revision: oldEntry.revision, command_id: oldEntry.command.commandId,
    entry: sql`${JSON.stringify(oldEntry)}::jsonb` }).execute();
  const before = await storedRows(id);

  const { manager, logger } = h.manager();
  expect(await manager.restoreAll()).toEqual({ restored: [], failed: [id] });
  expect(manager.get(id)?.status).toBe('failed');
  expect(logger.lines).toContainEqual(expect.objectContaining({
    level: 'error', message: 'room could not be restored',
    fields: expect.objectContaining({ gameId: id, errorName: 'ReplayDivergenceError' }),
  }));
  await manager.shutdown();
  expect(await storedRows(id)).toEqual(before);
});
