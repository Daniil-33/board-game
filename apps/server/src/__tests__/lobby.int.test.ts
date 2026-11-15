import { TypeCompiler } from '@sinclair/typebox/compiler';
import {
  CreateRoomResponseSchema,
  GuestLoginResponseSchema,
  ListRoomsResponseSchema,
  LobbyErrorSchema,
  type RoomSummary,
} from '@game/protocol';
import { afterEach, describe, expect, it } from 'vitest';
import { roomStatus } from './helpers/db.js';
import { useHarness } from './helpers/harness.js';
import { connect, expectStatus, http, login, startServer, stopServers, type TestGuest, type TestServer } from './helpers/server.js';

const h = useHarness();
afterEach(stopServers);

const checkLogin = TypeCompiler.Compile(GuestLoginResponseSchema);
const checkCreate = TypeCompiler.Compile(CreateRoomResponseSchema);
const checkList = TypeCompiler.Compile(ListRoomsResponseSchema);
const checkError = TypeCompiler.Compile(LobbyErrorSchema);

async function createRoom(s: TestServer, guest: TestGuest, accessCode?: string): Promise<RoomSummary> {
  const body = expectStatus(await http(s, 'POST', '/api/rooms', { token: guest.token, ...(accessCode ? { body: { accessCode } } : {}) }), 201);
  expect(checkCreate.Check(body)).toBe(true);
  return body.room;
}

const join = (s: TestServer, guest: TestGuest, roomId: string, body?: unknown) =>
  http(s, 'POST', `/api/rooms/${encodeURIComponent(roomId)}/join`, { token: guest.token, ...(body !== undefined ? { body } : {}) });
const leave = (s: TestServer, guest: TestGuest, roomId: string) => http(s, 'POST', `/api/rooms/${roomId}/leave`, { token: guest.token });
const start = (s: TestServer, guest: TestGuest, roomId: string) => http(s, 'POST', `/api/rooms/${roomId}/start`, { token: guest.token });
const list = async (s: TestServer, guest: TestGuest): Promise<RoomSummary[]> => {
  const body = expectStatus(await http(s, 'GET', '/api/rooms', { token: guest.token }), 200);
  expect(checkList.Check(body)).toBe(true);
  return body.rooms;
};

function expectError(res: { status: number; body: unknown }, status: number, code: string): void {
  expect({ status: res.status, body: res.body }).toMatchObject({ status, body: { code } });
  expect(checkError.Check(res.body)).toBe(true);
}

// spec: server/auth
describe('guest login and authentication', () => {
  it('Login: answers 201 { guestId, token } and stores the guest', async () => {
    const s = await startServer(h);
    const res = await http(s, 'POST', '/api/guests', { body: { nickname: 'bob' } });
    expect(res.status).toBe(201);
    expect(checkLogin.Check(res.body)).toBe(true);
    const row = await h.db.selectFrom('guests').selectAll().where('id', '=', res.body.guestId).executeTakeFirstOrThrow();
    expect(row.nickname).toBe('bob');
  });

  it('Two logins with the same nickname get different ids and tokens', async () => {
    const s = await startServer(h);
    const a = await login(s, 'same');
    const b = await login(s, 'same');
    expect(a.guestId).not.toBe(b.guestId);
    expect(a.token).not.toBe(b.token);
  });

  it('No plain token at rest or in the log', async () => {
    const s = await startServer(h);
    const guest = await login(s, 'secret');
    await list(s, guest);
    const rows = await h.db.selectFrom('guests').selectAll().execute();
    expect(JSON.stringify(rows)).not.toContain(guest.token);
    expect(JSON.stringify(s.logger.lines)).not.toContain(guest.token);
  });

  it.each([
    ['missing header', undefined],
    ['malformed header', 'Token abc'],
    ['unknown token', 'Bearer never-issued-token'],
  ])('Unknown token: %s -> 401 UNAUTHENTICATED', async (_name, authorization) => {
    const s = await startServer(h);
    const headers: Record<string, string> = authorization ? { authorization } : {};
    for (const [method, path] of [
      ['GET', '/api/rooms'],
      ['POST', '/api/rooms'],
      ['GET', '/api/rooms/r_x'],
      ['POST', '/api/rooms/r_x/join'],
      ['POST', '/api/rooms/r_x/leave'],
      ['POST', '/api/rooms/r_x/start'],
    ] as const) {
      expectError(await http(s, method, path, { headers }), 401, 'UNAUTHENTICATED');
    }
    // Authentication comes before body validation.
    expectError(await http(s, 'POST', '/api/rooms', { headers, body: { accessCode: 1 } }), 401, 'UNAUTHENTICATED');
  });
});

// spec: server/lobby "Strict request validation"
describe('strict request validation', () => {
  it('Unknown property: rejected with 400 and no guest is created', async () => {
    const s = await startServer(h);
    const before = await h.db.selectFrom('guests').select('id').execute();
    expectError(await http(s, 'POST', '/api/guests', { body: { nickname: 'bob', admin: true } }), 400, 'INVALID_REQUEST');
    expect(await h.db.selectFrom('guests').select('id').execute()).toHaveLength(before.length);
  });

  it('No coercion: { accessCode: 1234 } is 400', async () => {
    const s = await startServer(h);
    const a = await login(s, 'a');
    const room = await createRoom(s, a);
    const b = await login(s, 'b');
    expectError(await join(s, b, room.roomId, { accessCode: 1234 }), 400, 'INVALID_REQUEST');
    expectError(await http(s, 'POST', '/api/rooms', { token: a.token, body: { accessCode: 1234 } }), 400, 'INVALID_REQUEST');
  });

  it.each([
    ['invalid JSON', { rawBody: '{"nickname":' }],
    ['nickname not trimmed', { body: { nickname: ' bob' } }],
    ['nickname of joiners only', { body: { nickname: '‍' } }],
    ['nickname too long', { body: { nickname: 'x'.repeat(25) } }],
    ['nickname as number', { body: { nickname: 7 } }],
    ['JSON null', { rawBody: 'null' }],
    ['array', { body: ['bob'] }],
  ])('guest login with %s is 400 INVALID_REQUEST', async (_name, options) => {
    const s = await startServer(h);
    expectError(await http(s, 'POST', '/api/guests', options), 400, 'INVALID_REQUEST');
  });

  it('does not echo the access code in an error', async () => {
    const s = await startServer(h);
    const a = await login(s, 'a');
    const res = await http(s, 'POST', '/api/rooms', { token: a.token, body: { accessCode: 'bad code!' } });
    expectError(res, 400, 'INVALID_REQUEST');
    expect(JSON.stringify(res.body)).not.toContain('bad code!');
  });

  it('a room id with NUL is 400 before reaching the database', async () => {
    const s = await startServer(h);
    const a = await login(s, 'a');
    expectError(await http(s, 'GET', '/api/rooms/r%00x', { token: a.token }), 400, 'INVALID_REQUEST');
  });
});

// spec: server/lobby
describe('lobby', () => {
  it('Open room: lobby, unlocked, joinable, creator only member, no code fields', async () => {
    const s = await startServer(h);
    const a = await login(s, 'Alice');
    const res = await http(s, 'POST', '/api/rooms', { token: a.token });
    const body = expectStatus(res, 201);
    expect(body).toEqual({
      room: { roomId: expect.any(String), creatorId: a.guestId, status: 'lobby', locked: false, joinable: true, members: [{ guestId: a.guestId, nickname: 'Alice' }] },
    });
    const room = s.manager.get(body.room.roomId)!;
    expect(room.state.phase).toBe('lobby');
    expect(room.state.players.map((p) => p.id)).toEqual([a.guestId]);
  });

  it('Locked room: code echoed with an invite link, summary locked, code not stored', async () => {
    const s = await startServer(h);
    const a = await login(s, 'Alice');
    const body = expectStatus(await http(s, 'POST', '/api/rooms', { token: a.token, body: { accessCode: 'abcd' } }), 201);
    expect(body.accessCode).toBe('abcd');
    expect(body.inviteLink).toBe(`/?room=${body.room.roomId}&code=abcd`);
    expect(body.room).toMatchObject({ locked: true, joinable: false });
    const rows = await h.db.selectFrom('rooms').selectAll().execute();
    expect(JSON.stringify(rows)).not.toContain('abcd');
    expect(rows.find((r) => r.id === body.room.roomId)!.access_code_hash).toMatch(/^scrypt\$/);
    expect(JSON.stringify(s.logger.lines)).not.toContain('abcd');
  });

  it('Right and wrong code', async () => {
    const s = await startServer(h);
    const a = await login(s, 'Alice');
    const b = await login(s, 'Bob');
    const room = await createRoom(s, a, 'Sesame_42');
    expectError(await join(s, b, room.roomId), 403, 'ACCESS_CODE_REQUIRED');
    expectError(await join(s, b, room.roomId, { accessCode: 'sesame_42' }), 403, 'ACCESS_CODE_INVALID');
    const ok = expectStatus(await join(s, b, room.roomId, { accessCode: 'Sesame_42' }), 200);
    expect(ok.room.members.map((m: { guestId: string }) => m.guestId)).toEqual([a.guestId, b.guestId]);
    // A member needs no code again.
    expectStatus(await join(s, b, room.roomId), 200);
  });

  it('join is idempotent for a member and accepts a missing body', async () => {
    const s = await startServer(h);
    const a = await login(s, 'Alice');
    const b = await login(s, 'Bob');
    const room = await createRoom(s, a);
    expectStatus(await join(s, b, room.roomId), 200);
    const again = expectStatus(await join(s, b, room.roomId, {}), 200);
    expect(again.room.members).toHaveLength(2);
  });

  it('Seventh guest: 409 with the engine code, members unchanged', async () => {
    const s = await startServer(h);
    const guests = await Promise.all(['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((n) => login(s, n)));
    const room = await createRoom(s, guests[0]!);
    for (const g of guests.slice(1, 6)) expectStatus(await join(s, g, room.roomId), 200);
    const listed = (await list(s, guests[6]!)).find((r) => r.roomId === room.roomId)!;
    expect(listed).toMatchObject({ joinable: false, locked: false });
    expectError(await join(s, guests[6]!, room.roomId), 409, 'PLAYER_LIMIT_REACHED');
    const get = expectStatus(await http(s, 'GET', `/api/rooms/${room.roomId}`, { token: guests[0]!.token }), 200);
    expect(get.room.members).toHaveLength(6);
  });

  it('concurrent joins of five guests all succeed (revision retry)', async () => {
    const s = await startServer(h);
    const a = await login(s, 'host');
    const room = await createRoom(s, a);
    const others = await Promise.all(['b', 'c', 'd', 'e', 'f'].map((n) => login(s, n)));
    const results = await Promise.all(others.map((g) => join(s, g, room.roomId)));
    expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
    expect(s.manager.get(room.roomId)!.state.players).toHaveLength(6);
  });

  it('Late joiner nickname, non-member 403, unknown 404', async () => {
    const s = await startServer(h);
    const a = await login(s, 'Alice');
    const b = await login(s, 'Бob 🎲');
    const c = await login(s, 'Carol');
    const room = await createRoom(s, a);
    await join(s, b, room.roomId);
    const body = expectStatus(await http(s, 'GET', `/api/rooms/${room.roomId}`, { token: a.token }), 200);
    expect(body.room.members).toEqual([
      { guestId: a.guestId, nickname: 'Alice' },
      { guestId: b.guestId, nickname: 'Бob 🎲' },
    ]);
    expectError(await http(s, 'GET', `/api/rooms/${room.roomId}`, { token: c.token }), 403, 'NOT_A_PARTICIPANT');
    expectError(await http(s, 'GET', '/api/rooms/r_unknown', { token: c.token }), 404, 'ROOM_UNAVAILABLE');
    expectError(await join(s, c, 'r_unknown'), 404, 'ROOM_UNAVAILABLE');
  });

  it('Creator alone: start is 409 NOT_ENOUGH_PLAYERS; non-creator 403 NOT_ROOM_CREATOR', async () => {
    const s = await startServer(h);
    const a = await login(s, 'Alice');
    const b = await login(s, 'Bob');
    const room = await createRoom(s, a);
    expectError(await start(s, a, room.roomId), 409, 'NOT_ENOUGH_PLAYERS');
    await join(s, b, room.roomId);
    expectError(await start(s, b, room.roomId), 403, 'NOT_ROOM_CREATOR');
    const started = expectStatus(await start(s, a, room.roomId), 200);
    expect(started.room).toMatchObject({ status: 'playing', joinable: false });
    expect(await roomStatus(h.db, room.roomId)).toBe('playing');
  });

  it('join and leave after the start are 409 with the engine phase code', async () => {
    const s = await startServer(h);
    const a = await login(s, 'Alice');
    const b = await login(s, 'Bob');
    const c = await login(s, 'Carol');
    const room = await createRoom(s, a);
    await join(s, b, room.roomId);
    expectStatus(await start(s, a, room.roomId), 200);
    expectError(await join(s, c, room.roomId), 409, 'PHASE_NOT_ALLOWED');
    expectError(await leave(s, b, room.roomId), 409, 'PHASE_NOT_ALLOWED');
  });

  it('Member leaves: no longer listed as member, room stays listed; non-member leave 403', async () => {
    const s = await startServer(h);
    const a = await login(s, 'Alice');
    const b = await login(s, 'Bob');
    const c = await login(s, 'Carol');
    const room = await createRoom(s, a);
    await join(s, b, room.roomId);
    const left = expectStatus(await leave(s, b, room.roomId), 200);
    expect(left.room.status).toBe('lobby');
    expect(left.room.members.map((m: { guestId: string }) => m.guestId)).toEqual([a.guestId]);
    expect((await list(s, c)).map((r) => r.roomId)).toContain(room.roomId);
    expectError(await leave(s, b, room.roomId), 403, 'NOT_A_PARTICIPANT');
    expectError(await leave(s, c, room.roomId), 403, 'NOT_A_PARTICIPANT');
    // Leaving is not permanent: the guest may join again.
    expectStatus(await join(s, b, room.roomId), 200);
  });

  it('Creator leaves: closed, members notified, later join ROOM_CLOSED, not listed, get still works for members', async () => {
    const s = await startServer(h);
    const a = await login(s, 'Alice');
    const b = await login(s, 'Bob');
    const room = await createRoom(s, a);
    await join(s, b, room.roomId);
    const { socket } = await connect(s, b, room.roomId);

    const left = expectStatus(await leave(s, a, room.roomId), 200);
    expect(left.room).toMatchObject({ status: 'closed', joinable: false });
    expect(await roomStatus(h.db, room.roomId)).toBe('closed');

    const update = await socket.nextOf('Update');
    expect(update.events.map((e) => e.type)).toContain('PlayerLeftLobby');
    expect(await socket.nextOf('Error')).toMatchObject({ code: 'ROOM_CLOSED' });
    await socket.whenClosed();

    const c = await login(s, 'Carol');
    expectError(await join(s, c, room.roomId), 409, 'ROOM_CLOSED');
    expectError(await start(s, a, room.roomId), 409, 'ROOM_CLOSED');
    expectError(await leave(s, b, room.roomId), 409, 'ROOM_CLOSED');
    expect((await list(s, b)).map((r) => r.roomId)).not.toContain(room.roomId);
    const get = expectStatus(await http(s, 'GET', `/api/rooms/${room.roomId}`, { token: b.token }), 200);
    expect(get.room.status).toBe('closed');
  });

  it('Statuses in the list: lobby, playing and own finished only; joinable only for the open lobby room', async () => {
    const s = await startServer(h);
    const [a, b, c] = await Promise.all(['a', 'b', 'c'].map((n) => login(s, n))) as [TestGuest, TestGuest, TestGuest];

    const lobbyRoom = await createRoom(s, a);
    const lockedRoom = await createRoom(s, a, 'code1');
    const playingRoom = await createRoom(s, a);
    await join(s, b, playingRoom.roomId);
    expectStatus(await start(s, a, playingRoom.roomId), 200);

    // Finished with b as a member (b resigns through the socket).
    const finishedRoom = await createRoom(s, a);
    await join(s, b, finishedRoom.roomId);
    expectStatus(await start(s, a, finishedRoom.roomId), 200);
    const { socket } = await connect(s, b, finishedRoom.roomId);
    socket.send({ t: 'Command', commandId: 'resign-1', type: 'Resign', expected: { kind: 'revision', revision: s.manager.get(finishedRoom.roomId)!.state.revision }, payload: null });
    expect(await socket.nextOf('Ack')).toMatchObject({ outcome: 'accepted' });
    expect(await roomStatus(h.db, finishedRoom.roomId)).toBe('finished');

    const closedRoom = await createRoom(s, a);
    expectStatus(await leave(s, a, closedRoom.roomId), 200);

    const forB = new Map((await list(s, b)).map((r) => [r.roomId, r]));
    const forC = new Map((await list(s, c)).map((r) => [r.roomId, r]));
    expect(forB.get(lobbyRoom.roomId)).toMatchObject({ status: 'lobby', joinable: true, locked: false });
    expect(forB.get(lockedRoom.roomId)).toMatchObject({ status: 'lobby', joinable: false, locked: true });
    expect(forB.get(playingRoom.roomId)).toMatchObject({ status: 'playing', joinable: false });
    expect(forB.get(finishedRoom.roomId)).toMatchObject({ status: 'finished', joinable: false });
    expect(forB.has(closedRoom.roomId)).toBe(false);
    expect(forC.has(finishedRoom.roomId)).toBe(false);
    expect(forC.has(closedRoom.roomId)).toBe(false);
    expect(forC.has(playingRoom.roomId)).toBe(true);
  });
});
