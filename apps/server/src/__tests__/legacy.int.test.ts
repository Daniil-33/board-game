import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { sql } from 'kysely';
import { PROTOCOL_VERSION } from '@game/protocol';
import { seedRoom } from './helpers/db.js';
import { useHarness } from './helpers/harness.js';
import { lobby, sys, whenIdle } from './helpers/game.js';
import { startServer, stopServers, login, TestSocket } from './helpers/server.js';

const fixtures = await Promise.all(['core3', 'core4'].map(async version => JSON.parse(await readFile(new URL(`./fixtures/${version}.json`, import.meta.url), 'utf8'))));
let fixture = fixtures[0];
const h = useHarness({ perTest: true });
afterEach(stopServers);

async function legacy(id: string, snapshot: boolean) {
  for (const entry of fixture.log) await sql`insert into game_log (game_id, revision, command_id, entry)
    values (${id}, ${entry.revision}, ${entry.command.commandId}, ${JSON.stringify(entry)}::jsonb)`.execute(h.db);
  if (snapshot) await sql`insert into game_snapshots (game_id, revision, state)
    values (${id}, ${fixture.snapshot.revision}, ${JSON.stringify(fixture.snapshot)}::jsonb)`.execute(h.db);
}
const data = async (id: string) => ({
  room: await h.db.selectFrom('rooms').selectAll().where('id', '=', id).execute(),
  members: await h.db.selectFrom('room_members').selectAll().where('room_id', '=', id).execute(),
  logs: await h.db.selectFrom('game_log').selectAll().where('game_id', '=', id).orderBy('revision').execute(),
  snapshots: await h.db.selectFrom('game_snapshots').selectAll().where('game_id', '=', id).execute(),
});

describe.each(fixtures)('unsupported $snapshot.rulesVersion data', historical => {
  beforeEach(() => { fixture = historical; });
  it.each([false, true])('fails safely with old snapshot=%s and restores healthy core-5 alongside', async snapshot => {
    const bad = await seedRoom(h.db);
    await legacy(bad, snapshot);
    const good = await seedRoom(h.db);
    const first = h.manager();
    await lobby(await first.manager.open(good));
    const before = await data(bad);
    const second = h.manager();
    expect(await second.manager.restoreAll()).toEqual({ failed: [bad], restored: [good] });
    const failed = second.manager.get(bad)!;
    expect(failed.status).toBe('failed');
    expect(await failed.submit(sys('StartGame', null, 5))).toMatchObject({ kind: 'rejected', error: { code: 'ROOM_UNAVAILABLE' } });
    expect(second.clock.pending).toEqual([]);
    second.clock.advance(1_000_000);
    await whenIdle(failed);
    await second.manager.shutdown();
    expect(await data(bad)).toEqual(before);
  });

  it('directly opening closed legacy data registers a failed room; boot skips it', async () => {
    const id = await seedRoom(h.db);
    await legacy(id, true);
    await h.db.updateTable('rooms').set({ status: 'closed' }).where('id', '=', id).execute();
    const before = await data(id);
    const { manager, clock } = h.manager();
    expect(await manager.restoreAll()).toEqual({ restored: [], failed: [] });
    const room = await manager.open(id);
    expect(room.status).toBe('failed');
    expect(await room.submit(sys('StartGame', null, 5))).toMatchObject({ kind: 'rejected', error: { code: 'ROOM_UNAVAILABLE' } });
    expect(clock.pending).toEqual([]);
    await manager.shutdown();
    expect(await data(id)).toEqual(before);
  });

  it.each(['closed', 'finished'] as const)('Hello for %s core-3 keeps error precedence and stored data', async status => {
    const server = await startServer(h);
    const guest = await login(server, 'legacy guest');
    const id = await seedRoom(h.db);
    await legacy(id, true);
    await h.db.updateTable('rooms').set({ status }).where('id', '=', id).execute();
    const before = await data(id);
    const socket = await TestSocket.open(server.wsUrl);
    socket.send({ t: 'Hello', protocolVersion: PROTOCOL_VERSION, token: guest.token, gameId: id, lastRevision: null });
    expect(await socket.nextOf('Error')).toMatchObject({ code: status === 'closed' ? 'ROOM_CLOSED' : 'ROOM_UNAVAILABLE' });
    await socket.whenClosed();
    expect(server.manager.get(id)?.status).toBe(status === 'closed' ? undefined : 'failed');
    expect(server.clock.pending).toEqual([]);
    await server.stop();
    expect(await data(id)).toEqual(before);
  });
});
