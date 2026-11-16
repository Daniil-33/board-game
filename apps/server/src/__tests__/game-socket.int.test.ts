import { PROTOCOL_VERSION } from '@game/protocol';
import { afterEach, describe, expect, it } from 'vitest';
import type { GameState } from '@game/game-core';
import { logEntries } from './helpers/db.js';
import { nextMove } from './helpers/game.js';
import { useHarness } from './helpers/harness.js';
import {
  TestSocket,
  connect,
  expectStatus,
  http,
  login,
  startServer,
  stopServers,
  type TestGuest,
  type TestServer,
} from './helpers/server.js';

const h = useHarness();
afterEach(stopServers);

async function lobbyWith(s: TestServer, names: string[]): Promise<{ roomId: string; guests: TestGuest[] }> {
  const guests = await Promise.all(names.map((n) => login(s, n)));
  const created = expectStatus(await http(s, 'POST', '/api/rooms', { token: guests[0]!.token }), 201);
  const roomId: string = created.room.roomId;
  for (const g of guests.slice(1)) expectStatus(await http(s, 'POST', `/api/rooms/${roomId}/join`, { token: g.token }), 200);
  return { roomId, guests };
}

async function startedGame(s: TestServer, names: string[]) {
  const lobby = await lobbyWith(s, names);
  expectStatus(await http(s, 'POST', `/api/rooms/${lobby.roomId}/start`, { token: lobby.guests[0]!.token }), 200);
  return lobby;
}

/** The Command frame for the move the state calls for, and who must send it. */
function moveFrame(state: GameState, commandId: string) {
  const command = nextMove(state);
  if (command.actor.kind !== 'player') throw new Error('not a player move');
  return {
    by: command.actor.id as string,
    frame: { t: 'Command' as const, commandId, type: command.type, expected: command.expected, payload: null },
  };
}

async function hello(s: TestServer, frame: Record<string, unknown>): Promise<TestSocket> {
  const socket = await TestSocket.open(s.wsUrl);
  socket.send(frame);
  return socket;
}

// spec: server/game-socket "Hello first"
describe('Hello', () => {
  it('Welcome: playerId is the guest id, revision and view are current', async () => {
    const s = await startServer(h);
    const { roomId, guests } = await lobbyWith(s, ['a', 'b']);
    const { welcome } = await connect(s, guests[1]!, roomId);
    expect(welcome).toMatchObject({ protocolVersion: PROTOCOL_VERSION, playerId: guests[1]!.guestId, revision: 3 });
    expect(welcome.view).toMatchObject({ phase: 'lobby', revision: 3 });
    expect(welcome.view).not.toHaveProperty('rng');
  });

  it('Non-member: Error NOT_A_PARTICIPANT and close', async () => {
    const s = await startServer(h);
    const { roomId } = await lobbyWith(s, ['a', 'b']);
    const stranger = await login(s, 'stranger');
    const socket = await hello(s, { t: 'Hello', protocolVersion: PROTOCOL_VERSION, token: stranger.token, gameId: roomId, lastRevision: null });
    expect(await socket.nextOf('Error')).toMatchObject({ code: 'NOT_A_PARTICIPANT' });
    await socket.whenClosed();
  });

  it.each([
    ['a Command', { t: 'Command', commandId: 'c', type: 'RollDice', expected: { kind: 'revision', revision: 0 }, payload: null }],
    ['malformed JSON', '{"t":'],
    ['an unknown frame', { t: 'Ping' }],
  ])('Command before Hello: %s -> MALFORMED_FRAME and close', async (_name, frame) => {
    const s = await startServer(h);
    const socket = await TestSocket.open(s.wsUrl);
    if (typeof frame === 'string') socket.sendRaw(frame);
    else socket.send(frame);
    expect(await socket.nextOf('Error')).toMatchObject({ code: 'MALFORMED_FRAME' });
    await socket.whenClosed();
  });

  it('a binary first frame is MALFORMED_FRAME', async () => {
    const s = await startServer(h);
    const socket = await TestSocket.open(s.wsUrl);
    socket.ws.send(Buffer.from('{"t":"Hello"}'), { binary: true });
    expect(await socket.nextOf('Error')).toMatchObject({ code: 'MALFORMED_FRAME' });
    await socket.whenClosed();
  });

  it('Hello timeout -> MALFORMED_FRAME and close', async () => {
    const s = await startServer(h, { helloTimeoutMs: 100 });
    const socket = await TestSocket.open(s.wsUrl);
    expect(await socket.nextOf('Error')).toMatchObject({ code: 'MALFORMED_FRAME' });
    await socket.whenClosed();
  });

  it('wrong protocol version, unknown token, unknown room, closed room', async () => {
    const s = await startServer(h);
    const { roomId, guests } = await lobbyWith(s, ['a', 'b']);
    const base = { t: 'Hello', protocolVersion: PROTOCOL_VERSION, token: guests[1]!.token, gameId: roomId, lastRevision: null };
    const cases: [Record<string, unknown>, string][] = [
      [{ ...base, protocolVersion: 1, token: 'never-issued' }, 'PROTOCOL_VERSION_UNSUPPORTED'],
      [{ ...base, token: 'never-issued' }, 'UNAUTHENTICATED'],
      [{ ...base, gameId: 'r_unknown' }, 'ROOM_UNAVAILABLE'],
    ];
    for (const [frame, code] of cases) {
      const socket = await hello(s, frame);
      expect(await socket.nextOf('Error')).toMatchObject({ code });
      await socket.whenClosed();
    }
    expectStatus(await http(s, 'POST', `/api/rooms/${roomId}/leave`, { token: guests[0]!.token }), 200);
    const socket = await hello(s, base);
    expect(await socket.nextOf('Error')).toMatchObject({ code: 'ROOM_CLOSED' });
    await socket.whenClosed();
  });

  it('no token in the server log', async () => {
    const s = await startServer(h);
    const { roomId, guests } = await lobbyWith(s, ['a', 'b']);
    await connect(s, guests[1]!, roomId);
    expect(JSON.stringify(s.logger.lines)).not.toContain(guests[1]!.token);
  });
});

// spec: server/game-socket "Commands from the authenticated guest", "Updates to every member"
describe('commands and updates', () => {
  it('Join seen in lobby: the connected creator gets Update with PlayerAdded', async () => {
    const s = await startServer(h);
    const { roomId, guests } = await lobbyWith(s, ['a']);
    const { socket } = await connect(s, guests[0]!, roomId);
    const b = await login(s, 'b');
    expectStatus(await http(s, 'POST', `/api/rooms/${roomId}/join`, { token: b.token }), 200);
    const update = await socket.nextOf('Update');
    expect(update.events).toEqual([{ type: 'PlayerAdded', payload: { playerId: b.guestId } }]);
    expect(update.revision).toBe(3);
  });

  it('Unknown property: a Command with an actor is MALFORMED_FRAME, nothing submitted, socket stays open', async () => {
    const s = await startServer(h);
    const { roomId, guests } = await startedGame(s, ['a', 'b']);
    const room = s.manager.get(roomId)!;
    const { by, frame } = moveFrame(room.state, 'c-actor');
    const guest = guests.find((g) => g.guestId === by)!;
    const { socket } = await connect(s, guest, roomId);
    const before = room.state.revision;
    socket.send({ ...frame, actor: { kind: 'system' } });
    expect(await socket.nextOf('Error')).toMatchObject({ code: 'MALFORMED_FRAME' });
    expect(room.state.revision).toBe(before);
    // Still usable.
    socket.send(frame);
    expect(await socket.nextOf('Ack')).toMatchObject({ commandId: 'c-actor', outcome: 'accepted', revision: before + 1 });
  });

  it('a system command type from a client is MALFORMED_FRAME', async () => {
    const s = await startServer(h);
    const { roomId, guests } = await lobbyWith(s, ['a', 'b']);
    const { socket } = await connect(s, guests[0]!, roomId);
    socket.send({ t: 'Command', commandId: 'x', type: 'StartGame', expected: { kind: 'revision', revision: 3 }, payload: null });
    expect(await socket.nextOf('Error')).toMatchObject({ code: 'MALFORMED_FRAME' });
    expect(s.manager.get(roomId)!.state.phase).toBe('lobby');
  });

  it('a second Hello is MALFORMED_FRAME and the socket stays open', async () => {
    const s = await startServer(h);
    const { roomId, guests } = await lobbyWith(s, ['a', 'b']);
    const { socket } = await connect(s, guests[0]!, roomId);
    socket.send({ t: 'Hello', protocolVersion: PROTOCOL_VERSION, token: guests[0]!.token, gameId: roomId, lastRevision: null });
    expect(await socket.nextOf('Error')).toMatchObject({ code: 'MALFORMED_FRAME' });
    expect(socket.closeCode).toBeNull();
  });

  it('Duplicate delivery: both Acks accepted with the same revision, one log entry', async () => {
    const s = await startServer(h);
    const { roomId, guests } = await startedGame(s, ['a', 'b']);
    const room = s.manager.get(roomId)!;
    const { by, frame } = moveFrame(room.state, 'dup-1');
    const { socket } = await connect(s, guests.find((g) => g.guestId === by)!, roomId);
    socket.send(frame);
    socket.send(frame);
    const first = await socket.nextOf('Ack');
    const second = await socket.nextOf('Ack');
    expect(first).toEqual(second);
    expect(first).toMatchObject({ outcome: 'accepted' });
    const entries = await logEntries(h.db, roomId);
    expect(entries.filter((e) => e.command.commandId === 'dup-1')).toHaveLength(1);
  });

  it('Update precedes Ack, and a rejected command is Ack rejected with the engine code', async () => {
    const s = await startServer(h);
    const { roomId, guests } = await startedGame(s, ['a', 'b']);
    const room = s.manager.get(roomId)!;
    const { by, frame } = moveFrame(room.state, 'first');
    const mover = guests.find((g) => g.guestId === by)!;
    const other = guests.find((g) => g.guestId !== by)!;
    const { socket } = await connect(s, mover, roomId);
    socket.send(frame);
    const kinds: string[] = [];
    kinds.push((await socket.next((f) => f.t === 'Update' || f.t === 'Ack')).t);
    kinds.push((await socket.next((f) => f.t === 'Update' || f.t === 'Ack')).t);
    expect(kinds).toEqual(['Update', 'Ack']);

    const { socket: otherSocket } = await connect(s, other, roomId);
    otherSocket.send({ ...frame, commandId: 'stale' });
    const ack = await otherSocket.nextOf('Ack');
    expect(ack).toMatchObject({ outcome: 'rejected', commandId: 'stale' });
  });
});

// spec: server/game-socket "Reconnect, not resignation", "Removed members are disconnected"
describe('reconnect and removal', () => {
  it('Drop and reconnect: the drop changes nothing; Welcome at the current revision', async () => {
    const s = await startServer(h);
    const { roomId, guests } = await startedGame(s, ['a', 'b']);
    const room = s.manager.get(roomId)!;
    const { socket, welcome } = await connect(s, guests[0]!, roomId);
    socket.drop();
    await socket.whenClosed();
    const revision = room.state.revision;
    const entries = (await logEntries(h.db, roomId)).length;
    const again = await connect(s, guests[0]!, roomId, welcome.revision);
    expect(again.welcome.revision).toBe(revision);
    expect((await logEntries(h.db, roomId)).length).toBe(entries);
    expect(room.state.eliminated).toEqual([]);
  });

  it('a newer socket replaces the older one: CONNECTION_REPLACED, the newer keeps updates', async () => {
    const s = await startServer(h);
    const { roomId, guests } = await lobbyWith(s, ['a']);
    const first = await connect(s, guests[0]!, roomId);
    const second = await connect(s, guests[0]!, roomId);
    expect(await first.socket.nextOf('Error')).toMatchObject({ code: 'CONNECTION_REPLACED' });
    expect(await first.socket.whenClosed()).toBe(4001);
    const b = await login(s, 'b');
    expectStatus(await http(s, 'POST', `/api/rooms/${roomId}/join`, { token: b.token }), 200);
    expect((await second.socket.nextOf('Update')).events[0]).toMatchObject({ type: 'PlayerAdded' });
    // The old socket's close did not unregister the new one: a third replaces the second.
    const third = await connect(s, guests[0]!, roomId);
    expect(await second.socket.nextOf('Error')).toMatchObject({ code: 'CONNECTION_REPLACED' });
    expect(third.socket.closeCode).toBeNull();
  });

  it("Leaver's socket: Update, then NOT_A_PARTICIPANT and close; others stay", async () => {
    const s = await startServer(h);
    const { roomId, guests } = await lobbyWith(s, ['a', 'b']);
    const leaver = await connect(s, guests[1]!, roomId);
    const host = await connect(s, guests[0]!, roomId);
    expectStatus(await http(s, 'POST', `/api/rooms/${roomId}/leave`, { token: guests[1]!.token }), 200);
    expect((await leaver.socket.nextOf('Update')).events[0]).toMatchObject({ type: 'PlayerLeftLobby' });
    expect(await leaver.socket.nextOf('Error')).toMatchObject({ code: 'NOT_A_PARTICIPANT' });
    await leaver.socket.whenClosed();
    expect((await host.socket.nextOf('Update')).events[0]).toMatchObject({ type: 'PlayerLeftLobby' });
    expect(host.socket.closeCode).toBeNull();
  });
});
