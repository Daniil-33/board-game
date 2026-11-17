import { MAX_FRAME_LENGTH, PROTOCOL_VERSION, type ChatAckFrame, type ChatFrame, type UpdateFrame } from '@game/protocol';
import { WELCOME_WARN_LENGTH } from '../ws/connection.js';
import { projectEvents, type GameEvent, type Viewer } from '@game/game-core';
import { sql } from 'kysely';
import { afterEach, describe, expect, it } from 'vitest';
import { createGameStore, type GameStore } from '../db/game-store.js';
import { logEntries, seedRoom } from './helpers/db.js';
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

let msgCounter = 0;
const chatSend = (text: string) => ({ t: 'ChatSend' as const, clientMsgId: `m-${++msgCounter}`, text });

async function lobbyWith(s: TestServer, names: string[]): Promise<{ roomId: string; guests: TestGuest[] }> {
  const guests = await Promise.all(names.map((n) => login(s, n)));
  const created = expectStatus(await http(s, 'POST', '/api/rooms', { token: guests[0]!.token }), 201);
  const roomId: string = created.room.roomId;
  for (const g of guests.slice(1)) expectStatus(await http(s, 'POST', `/api/rooms/${roomId}/join`, { token: g.token }), 200);
  return { roomId, guests };
}

async function startGame(s: TestServer, roomId: string, creator: TestGuest): Promise<void> {
  expectStatus(await http(s, 'POST', `/api/rooms/${roomId}/start`, { token: creator.token }), 200);
}

/** Send one chat message and wait for its ChatAck. */
async function say(socket: TestSocket, text: string): Promise<ChatAckFrame> {
  const frame = chatSend(text);
  socket.send(frame);
  return socket.next<ChatAckFrame>((f) => f.t === 'ChatAck' && f.clientMsgId === frame.clientMsgId);
}

const chats = (socket: TestSocket): ChatFrame[] => socket.frames.filter((f): f is ChatFrame => f.t === 'Chat');

async function storedChat(roomId: string) {
  return h.db.selectFrom('chat_messages').selectAll().where('room_id', '=', roomId).orderBy('seq').execute();
}

/** What `Welcome.history.entries` must hold for `viewer`, from the stored log. */
async function expectedEntries(roomId: string, viewer: Viewer, project = projectEvents) {
  const log = await logEntries(h.db, roomId);
  return log
    .slice(-200)
    .map((e) => ({ revision: e.revision, at: e.now, events: project(e.events, viewer) }))
    .filter((e) => e.events.length > 0);
}

// spec: server/chat "Room chat"
describe('room chat', () => {
  it('a message reaches every guest, then the sender gets ChatAck ok', async () => {
    const s = await startServer(h);
    const { roomId, guests } = await lobbyWith(s, ['a', 'b', 'c']);
    await startGame(s, roomId, guests[0]!);
    const sockets = await Promise.all(guests.map(async (g) => (await connect(s, g, roomId)).socket));

    const ack = await say(sockets[1]!, '  hello\nall  ');
    expect(ack).toMatchObject({ ok: true });
    const expected = { t: 'Chat', message: { seq: 1, authorId: guests[1]!.guestId, text: 'hello\nall', at: s.clock.now() } };
    for (const socket of sockets) expect(await socket.seen((f) => f.t === 'Chat')).toEqual(expected);
    // The sender saw Chat before its ChatAck.
    const own = sockets[1]!.frames;
    expect(own.findIndex((f) => f.t === 'Chat')).toBeLessThan(own.findIndex((f) => f.t === 'ChatAck'));
    expect(await storedChat(roomId)).toEqual([
      { room_id: roomId, seq: 1, author_id: guests[1]!.guestId, text: 'hello\nall', created_at: new Date(s.clock.now()) },
    ]);

    s.clock.advance(500);
    expect(await say(sockets[2]!, 'second')).toMatchObject({ ok: true });
    for (const socket of sockets) {
      expect((await socket.seen<ChatFrame>((f) => f.t === 'Chat' && f.message.seq === 2)).message).toMatchObject({ text: 'second' });
      expect(chats(socket)).toHaveLength(2);
    }
  });

  it('an eliminated player who is still connected can write', async () => {
    const s = await startServer(h);
    const { roomId, guests } = await lobbyWith(s, ['a', 'b', 'c']);
    await startGame(s, roomId, guests[0]!);
    const { socket, welcome } = await connect(s, guests[0]!, roomId);
    const other = (await connect(s, guests[1]!, roomId)).socket;
    socket.send({ t: 'Command', commandId: 'resign-1', type: 'Resign', expected: { kind: 'revision', revision: welcome.revision }, payload: null });
    expect(await socket.seen((f) => f.t === 'Ack')).toMatchObject({ outcome: 'accepted' });
    const update = await socket.seen<UpdateFrame>((f) => f.t === 'Update');
    expect(update.view.eliminated).toContain(guests[0]!.guestId);
    expect(update.view.phase).not.toBe('finished');

    expect(await say(socket, 'gg')).toMatchObject({ ok: true });
    expect((await other.nextOf('Chat')).message).toMatchObject({ authorId: guests[0]!.guestId, text: 'gg' });
  });

  it('a non-member is refused on Hello, and the room rejects chat from a non-member', async () => {
    const s = await startServer(h);
    const { roomId } = await lobbyWith(s, ['a', 'b']);
    const stranger = await login(s, 'stranger');
    const socket = await TestSocket.open(s.wsUrl);
    socket.send({ t: 'Hello', protocolVersion: PROTOCOL_VERSION, token: stranger.token, gameId: roomId, lastRevision: null });
    expect(await socket.nextOf('Error')).toMatchObject({ code: 'NOT_A_PARTICIPANT' });
    await socket.whenClosed();

    const room = await s.manager.open(roomId);
    expect(await room.chat(stranger.guestId, 'hi')).toEqual({ ok: false, reason: 'NOT_A_MEMBER' });
    expect(await storedChat(roomId)).toEqual([]);
  });

  it.each([
    ['EMPTY', ' \n '],
    ['TOO_LONG', 'x'.repeat(301)],
    ['CONTROL_CHARACTER', 'a\tb'],
    ['CONTROL_CHARACTER', 'a\r\nb'],
    ['TOO_MANY_LINES', '1\n2\n3\n4\n5'],
  ])('rejects %s and neither stores nor broadcasts it', async (reason, text) => {
    const s = await startServer(h);
    const { roomId, guests } = await lobbyWith(s, ['a', 'b']);
    const sender = (await connect(s, guests[0]!, roomId)).socket;
    const other = (await connect(s, guests[1]!, roomId)).socket;
    expect(await say(sender, text)).toMatchObject({ ok: false, reason });
    // A rejected message does not use the rate budget: the next one is accepted at once.
    expect(await say(sender, 'fine')).toMatchObject({ ok: true });
    expect((await other.nextOf('Chat')).message).toMatchObject({ seq: 1, text: 'fine' });
    expect(chats(sender)).toHaveLength(1);
    expect((await storedChat(roomId)).map((r) => r.text)).toEqual(['fine']);
  });

  it('a 4096-unit text is TOO_LONG; a longer frame is MALFORMED_FRAME', async () => {
    const s = await startServer(h);
    const { roomId, guests } = await lobbyWith(s, ['a', 'b']);
    const sender = (await connect(s, guests[0]!, roomId)).socket;
    expect(await say(sender, 'x'.repeat(4096))).toMatchObject({ ok: false, reason: 'TOO_LONG' });
    sender.send(chatSend('x'.repeat(4097)));
    expect(await sender.nextOf('Error')).toMatchObject({ code: 'MALFORMED_FRAME' });
  });
});

// spec: server/chat "Chat rate limit"
describe('rate limit', () => {
  it('TOO_FAST within 500 ms, RATE_LIMITED for a sixth message within 10 s; only accepted messages count', async () => {
    const s = await startServer(h);
    const { roomId, guests } = await lobbyWith(s, ['a', 'b']);
    const a = (await connect(s, guests[0]!, roomId)).socket;
    const b = (await connect(s, guests[1]!, roomId)).socket;

    expect(await say(a, '1')).toMatchObject({ ok: true });
    expect(await say(a, 'too fast')).toMatchObject({ ok: false, reason: 'TOO_FAST' });
    s.clock.advance(499);
    expect(await say(a, 'still too fast')).toMatchObject({ ok: false, reason: 'TOO_FAST' });
    // Another author has a budget of its own.
    expect(await say(b, 'b1')).toMatchObject({ ok: true });
    for (const text of ['2', '3', '4', '5']) {
      s.clock.advance(500);
      expect(await say(a, text)).toMatchObject({ ok: true });
    }
    s.clock.advance(500);
    expect(await say(a, '6')).toMatchObject({ ok: false, reason: 'RATE_LIMITED' });
    // The first accepted message was at T; at T + 10 s it leaves the window.
    s.clock.advance(10_000 - 499 - 4 * 500 - 500);
    expect(await say(a, '6 again')).toMatchObject({ ok: true });
    expect((await storedChat(roomId)).map((r) => r.text)).toEqual(['1', 'b1', '2', '3', '4', '5', '6 again']);
  });
});

/** A store that records the order of chat writes, and can fail the next one or hold history reads. */
function instrumentedStore() {
  const order: string[] = [];
  let failNext = false;
  let gate: Promise<void> | null = null;
  let open: () => void = () => undefined;
  let reached: () => void = () => undefined;
  let entered = new Promise<void>((resolve) => (reached = resolve));
  return {
    order,
    failNextChat() {
      failNext = true;
    },
    holdHistory() {
      entered = new Promise<void>((resolve) => (reached = resolve));
      gate = new Promise<void>((resolve) => (open = resolve));
    },
    historyEntered: () => entered,
    release() {
      gate = null;
      open();
    },
    wrap: (store: GameStore): GameStore => ({
      ...store,
      async appendChat(gameId, message) {
        if (failNext) {
          failNext = false;
          throw new Error('injected chat write failure');
        }
        await store.appendChat(gameId, message);
        order.push(`stored ${message.seq}`);
      },
      async loadHistory(...args) {
        reached();
        if (gate !== null) await gate;
        return store.loadHistory(...args);
      },
    }),
  };
}

// spec: server/chat "Chat persists before broadcast"
describe('persistence', () => {
  it('stores the message before any connection receives it', async () => {
    const store = instrumentedStore();
    const s = await startServer(h, { wrapStore: store.wrap });
    const { roomId, guests } = await lobbyWith(s, ['a', 'b']);
    const a = (await connect(s, guests[0]!, roomId)).socket;
    const b = (await connect(s, guests[1]!, roomId)).socket;
    s.manager.get(roomId)!.subscribe((event) => {
      if (event.kind === 'chat') store.order.push(`emitted ${event.message.seq}`);
    });
    expect(await say(a, 'hi')).toMatchObject({ ok: true });
    const seen = await b.nextOf('Chat');
    expect(await storedChat(roomId)).toMatchObject([{ seq: seen.message.seq }]);
    expect(store.order).toEqual(['stored 1', 'emitted 1']);
  });

  it('a failed write answers PERSISTENCE_FAILED, broadcasts nothing, and the next message takes the free seq', async () => {
    const store = instrumentedStore();
    const s = await startServer(h, { wrapStore: store.wrap });
    const { roomId, guests } = await lobbyWith(s, ['a', 'b']);
    const a = (await connect(s, guests[0]!, roomId)).socket;
    const b = (await connect(s, guests[1]!, roomId)).socket;
    store.failNextChat();
    expect(await say(a, 'lost')).toEqual(expect.objectContaining({ ok: false, reason: 'PERSISTENCE_FAILED' }));
    // A failed write does not count against the rate limit either.
    expect(await say(a, 'kept')).toMatchObject({ ok: true });
    expect(chats(a).map((f) => f.message)).toMatchObject([{ seq: 1, text: 'kept' }]);
    expect((await b.nextOf('Chat')).message).toMatchObject({ seq: 1, text: 'kept' });
    expect(chats(b)).toHaveLength(1);
    expect((await storedChat(roomId)).map((r) => [r.seq, r.text])).toEqual([[1, 'kept']]);
  });

  it('a room that is shut down answers ROOM_UNAVAILABLE', async () => {
    const s = await startServer(h);
    const { roomId, guests } = await lobbyWith(s, ['a', 'b']);
    const room = await s.manager.open(roomId);
    await s.manager.shutdown();
    expect(await room.chat(guests[0]!.guestId, 'hi')).toEqual({ ok: false, reason: 'ROOM_UNAVAILABLE' });
  });

  it('seq continues from the stored maximum after a restart', async () => {
    const s = await startServer(h);
    const { roomId, guests } = await lobbyWith(s, ['a', 'b']);
    const a = (await connect(s, guests[0]!, roomId)).socket;
    expect(await say(a, 'one')).toMatchObject({ ok: true });
    await s.stop();
    const s2 = await startServer(h, { restore: true });
    const again = (await connect(s2, guests[0]!, roomId)).socket;
    expect(await say(again, 'two')).toMatchObject({ ok: true });
    expect(chats(again).map((f) => f.message)).toMatchObject([{ seq: 2, text: 'two' }]);
  });
});

// spec: server/chat "Welcome history", "History is consistent with later frames", "History follows the event projection"
describe('Welcome history', () => {
  async function chatAndPlay(s: TestServer) {
    const { roomId, guests } = await lobbyWith(s, ['a', 'b', 'c']);
    const a = (await connect(s, guests[0]!, roomId)).socket;
    expect(await say(a, 'before start')).toMatchObject({ ok: true });
    await startGame(s, roomId, guests[0]!);
    s.clock.advance(500);
    expect(await say(a, 'after start')).toMatchObject({ ok: true });
    return { roomId, guests, a };
  }

  it('after a reload the Welcome carries the log entries with revision and time, and the chat', async () => {
    const s = await startServer(h);
    const { roomId, guests } = await chatAndPlay(s);
    const { welcome } = await connect(s, guests[1]!, roomId);
    const viewer = { kind: 'player', id: guests[1]!.guestId } as Viewer;
    expect(welcome.history.entries).toEqual(await expectedEntries(roomId, viewer));
    expect(welcome.history.entries.at(-1)!.revision).toBe(welcome.revision);
    expect(welcome.history.entries.map((e) => e.revision)).toEqual([...welcome.history.entries.map((e) => e.revision)].sort((x, y) => x - y));
    expect(welcome.history.chat).toEqual([
      { seq: 1, authorId: guests[0]!.guestId, text: 'before start', at: expect.any(Number) },
      { seq: 2, authorId: guests[0]!.guestId, text: 'after start', at: expect.any(Number) },
    ]);
    expect(welcome.history.chat[1]!.at - welcome.history.chat[0]!.at).toBe(500);
  });

  it('after a restart the Welcome history is what it was before', async () => {
    const s = await startServer(h);
    const { roomId, guests } = await chatAndPlay(s);
    const before = (await connect(s, guests[2]!, roomId)).welcome;
    await s.stop();
    const s2 = await startServer(h, { restore: true });
    const after = (await connect(s2, guests[2]!, roomId)).welcome;
    expect(after.history).toEqual(before.history);
    expect(after.history.chat).toHaveLength(2);
    expect(after.history.entries.length).toBeGreaterThan(0);
  });

  it('a finished room serves its history, also after a restart', async () => {
    const s = await startServer(h);
    const { roomId, guests } = await lobbyWith(s, ['a', 'b']);
    await startGame(s, roomId, guests[0]!);
    const { socket, welcome } = await connect(s, guests[0]!, roomId);
    expect(await say(socket, 'good luck')).toMatchObject({ ok: true });
    socket.send({ t: 'Command', commandId: 'resign-1', type: 'Resign', expected: { kind: 'revision', revision: welcome.revision }, payload: null });
    expect(await socket.seen((f) => f.t === 'Ack')).toMatchObject({ outcome: 'accepted' });
    expect((await socket.seen<UpdateFrame>((f) => f.t === 'Update')).view.phase).toBe('finished');
    s.clock.advance(500);
    expect(await say(socket, 'gg')).toMatchObject({ ok: true });

    const live = (await connect(s, guests[1]!, roomId)).welcome;
    expect(live.view.phase).toBe('finished');
    expect(live.history.entries.at(-1)!.events.some((e) => e.type === 'GameEnded')).toBe(true);
    expect(live.history.chat.map((m) => m.text)).toEqual(['good luck', 'gg']);

    await s.stop();
    const s2 = await startServer(h, { restore: true });
    const restarted = (await connect(s2, guests[1]!, roomId)).welcome;
    expect(restarted.history).toEqual(live.history);
  });

  it('a message accepted while a Hello is answered is seen exactly once, as a Chat frame', async () => {
    const store = instrumentedStore();
    const s = await startServer(h, { wrapStore: store.wrap });
    const { roomId, guests } = await lobbyWith(s, ['a', 'b', 'c']);
    const a = (await connect(s, guests[0]!, roomId)).socket;

    store.holdHistory();
    const c = await TestSocket.open(s.wsUrl);
    c.send({ t: 'Hello', protocolVersion: PROTOCOL_VERSION, token: guests[2]!.token, gameId: roomId, lastRevision: null });
    await store.historyEntered();
    const frame = chatSend('during hello');
    a.send(frame);
    // The message waits behind the Hello's step of the room queue.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(a.frames.some((f) => f.t === 'ChatAck')).toBe(false);
    store.release();

    const welcome = await c.nextOf('Welcome');
    expect(welcome.history.chat).toEqual([]);
    expect((await c.nextOf('Chat')).message).toMatchObject({ seq: 1, text: 'during hello' });
    expect(await a.next((f) => f.t === 'ChatAck')).toMatchObject({ clientMsgId: frame.clientMsgId, ok: true });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(chats(c)).toHaveLength(1);
  });

  it('a message stored before a Hello is only in the history', async () => {
    const s = await startServer(h);
    const { roomId, guests } = await lobbyWith(s, ['a', 'b']);
    const a = (await connect(s, guests[0]!, roomId)).socket;
    expect(await say(a, 'earlier')).toMatchObject({ ok: true });
    const { socket, welcome } = await connect(s, guests[1]!, roomId);
    expect(welcome.history.chat.map((m) => m.text)).toEqual(['earlier']);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(chats(socket)).toEqual([]);
  });

  it('history hides what the viewer projection hides, like Update does, and drops emptied entries', async () => {
    // Every core event is public today, so a test projection hides one type.
    const hidden = 'PlayerAdded';
    const project = (events: readonly GameEvent[], viewer: Viewer) => projectEvents(events, viewer).filter((e) => e.type !== hidden);
    const s = await startServer(h, { projectEvents: project });
    const { roomId, guests } = await lobbyWith(s, ['a', 'b']);
    const log = await logEntries(h.db, roomId);
    expect(log.some((e) => e.events.length > 0 && e.events.every((ev) => ev.type === hidden))).toBe(true);

    const { socket, welcome } = await connect(s, guests[0]!, roomId);
    const viewer = { kind: 'player', id: guests[0]!.guestId } as Viewer;
    expect(welcome.history.entries).toEqual(await expectedEntries(roomId, viewer, project));
    expect(welcome.history.entries.flatMap((e) => e.events).some((e) => e.type === hidden)).toBe(false);
    expect(welcome.history.entries.every((e) => e.events.length > 0)).toBe(true);
    expect(welcome.history.entries.length).toBeLessThan(log.length);

    const late = await login(s, 'c');
    expectStatus(await http(s, 'POST', `/api/rooms/${roomId}/join`, { token: late.token }), 200);
    const update = await socket.nextOf('Update');
    expect(update.events.some((e) => e.type === hidden)).toBe(false);
  });

  it('a Welcome above 75% of the client frame limit is logged as a warning, and one below is not', async () => {
    // Pad each projected entry so the lobby's few entries fill about 80% of the limit.
    let pad = 0;
    const project = (events: readonly GameEvent[], viewer: Viewer) =>
      pad === 0 ? projectEvents(events, viewer) : [...projectEvents(events, viewer), { type: 'Pad', payload: 'x'.repeat(pad) }];
    const s = await startServer(h, { projectEvents: project });
    const { roomId, guests } = await lobbyWith(s, ['a', 'b']);
    const warned = () => s.logger.lines.filter((l) => l.level === 'warn' && l.message === 'Welcome frame nears the client frame limit');

    await connect(s, guests[0]!, roomId);
    expect(warned()).toEqual([]);

    const entries = (await logEntries(h.db, roomId)).length;
    pad = Math.floor((MAX_FRAME_LENGTH * 0.8) / entries);
    const { welcome } = await connect(s, guests[1]!, roomId);
    expect(JSON.stringify(welcome).length).toBeGreaterThan(WELCOME_WARN_LENGTH);
    expect(warned()).toEqual([
      expect.objectContaining({ fields: expect.objectContaining({ roomId, guestId: guests[1]!.guestId, limit: MAX_FRAME_LENGTH }) }),
    ]);
  });

  it('history holds at most the last 200 log entries and 200 messages', async () => {
    const roomId = await seedRoom(h.db);
    const author = `u-${roomId}`;
    for (let revision = 1; revision <= 205; revision++) {
      const entry = { revision, now: 1000 + revision, entropy: [0], command: { commandId: `c${revision}` }, events: [{ type: 'X', payload: revision }] };
      await sql`insert into game_log (game_id, revision, command_id, entry)
        values (${roomId}, ${revision}, ${`c${revision}`}, ${JSON.stringify(entry)}::jsonb)`.execute(h.db);
    }
    const store = createGameStore(h.db);
    for (let seq = 1; seq <= 205; seq++) await store.appendChat(roomId, { seq, authorId: author, text: `m${seq}`, at: 5000 + seq });

    const history = await store.loadHistory(roomId, 203, 200);
    expect(history.entries.map((e) => e.revision)).toEqual(Array.from({ length: 200 }, (_, i) => i + 4));
    expect(history.entries[0]).toMatchObject({ now: 1004, events: [{ type: 'X', payload: 4 }] });
    expect(history.chat.map((m) => m.seq)).toEqual(Array.from({ length: 200 }, (_, i) => i + 6));
    expect(history.chat[0]).toEqual({ seq: 6, authorId: author, text: 'm6', at: 5006 });
  });
});

// spec: server/persistence "Chat storage"
describe('chat_messages', () => {
  it('rejects a second row for a (room, seq), a seq of 0 and text outside 1-300 code points', async () => {
    const roomId = await seedRoom(h.db);
    const insert = (seq: number, text: string) =>
      sql`insert into chat_messages (room_id, seq, author_id, text, created_at)
          values (${roomId}, ${seq}, ${`u-${roomId}`}, ${text}, now())`.execute(h.db);
    await insert(1, 'a');
    await expect(insert(1, 'b')).rejects.toMatchObject({ code: '23505', constraint: 'chat_messages_pkey' });
    await expect(insert(0, 'b')).rejects.toMatchObject({ code: '23514' });
    await expect(insert(2, '')).rejects.toMatchObject({ code: '23514' });
    await expect(insert(2, 'x'.repeat(301))).rejects.toMatchObject({ code: '23514' });
    await insert(2, '😀'.repeat(300));
    await expect(insert(3, '😀'.repeat(301))).rejects.toMatchObject({ code: '23514' });
  });

  it('rejects an unknown room or author', async () => {
    const roomId = await seedRoom(h.db);
    await expect(sql`insert into chat_messages (room_id, seq, author_id, text, created_at)
      values (${roomId}, 1, 'nobody', 'a', now())`.execute(h.db)).rejects.toMatchObject({ code: '23503' });
    await expect(sql`insert into chat_messages (room_id, seq, author_id, text, created_at)
      values ('no-room', 1, ${`u-${roomId}`}, 'a', now())`.execute(h.db)).rejects.toMatchObject({ code: '23503' });
  });
});
