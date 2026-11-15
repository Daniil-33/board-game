// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { Value } from '@sinclair/typebox/value';
import {
  CreateRoomResponseSchema,
  GuestLoginResponseSchema,
  ListRoomsResponseSchema,
  decodeServerFrame,
  type ClientFrame,
  type ServerFrame,
} from '@game/protocol';
import type { StateView } from '@game/game-core';
import { stepsForEvents } from '../../src/game/animation';
import { MockServer, type MockPeer } from '../server';

/** Manual clock and timers. */
function fakeTimers() {
  let now = 1_000_000;
  let nextHandle = 1;
  const timers = new Map<number, { at: number; callback: () => void }>();
  return {
    now: () => now,
    setTimeout: (callback: () => void, ms: number) => {
      timers.set(nextHandle, { at: now + ms, callback });
      return nextHandle++;
    },
    clearTimeout: (handle: unknown) => void timers.delete(handle as number),
    /** Advance time, firing due timers in order. */
    advance(ms: number): void {
      const end = now + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (due === undefined) break;
        timers.delete(due[0]);
        now = Math.max(now, due[1].at);
        due[1].callback();
      }
      now = end;
    },
  };
}

/** A peer that decodes everything the mock sends with the protocol decoder. */
function peer() {
  const frames: ServerFrame[] = [];
  let closed = false;
  const mockPeer: MockPeer = {
    send(frame) {
      const decoded = decodeServerFrame(JSON.stringify(frame));
      if (!decoded.ok) throw new Error(`mock sent an invalid frame: ${decoded.error.message}`);
      frames.push(decoded.frame);
    },
    close: () => void (closed = true),
  };
  return {
    mockPeer,
    frames,
    get closed() {
      return closed;
    },
    view(): StateView {
      const last = [...frames].reverse().find((f) => f.t === 'Welcome' || f.t === 'Update');
      if (last === undefined || (last.t !== 'Welcome' && last.t !== 'Update')) throw new Error('no view yet');
      return last.view;
    },
    eventTypes(): string[] {
      return frames.flatMap((f) => (f.t === 'Update' ? f.events.map((e) => e.type) : []));
    },
  };
}

function setup(turnMs = 45_000) {
  const timers = fakeTimers();
  const mock = new MockServer({ turnMs, continuationMs: Math.min(20_000, turnMs), timers });
  const login = mock.http('POST', '/api/guests', undefined, { nickname: 'Alice' });
  if (!Value.Check(GuestLoginResponseSchema, login.body)) throw new Error('bad login response');
  const { guestId, token } = login.body;
  const auth = `Bearer ${token}`;
  const say = (p: ReturnType<typeof peer>, frame: ClientFrame): void => mock.message(p.mockPeer, JSON.stringify(frame));
  const hello = (p: ReturnType<typeof peer>, gameId: string): void =>
    say(p, { t: 'Hello', protocolVersion: 1, token, gameId, lastRevision: null });
  let nextCommand = 1;
  /** The human acts if the view allows it. Returns whether a command was sent. */
  const act = (p: ReturnType<typeof peer>): boolean => {
    const view = p.view();
    const base = { t: 'Command' as const, commandId: `c${nextCommand++}` as never, payload: null };
    if (view.setup?.playerId === guestId) {
      say(p, { ...base, type: 'RollForOrder', expected: { kind: 'target', target: { kind: 'setupRoll', id: view.setup.setupRollId } } });
      return true;
    }
    if (view.turn?.playerId === guestId) {
      const type = view.turn.rolled ? 'EndTurn' : 'RollDice';
      say(p, { ...base, type, expected: { kind: 'target', target: { kind: 'turn', id: view.turn.turnId } } });
      return true;
    }
    return false;
  };
  return { timers, mock, guestId, token, auth, say, hello, act };
}

describe('mock lobby', () => {
  it('answers with protocol lobby payloads on the client routes', () => {
    const { mock, auth, guestId } = setup();
    const list = mock.http('GET', '/api/rooms', auth, undefined);
    expect(Value.Check(ListRoomsResponseSchema, list.body)).toBe(true);
    const created = mock.http('POST', '/api/rooms', auth, undefined);
    expect(Value.Check(CreateRoomResponseSchema, created.body)).toBe(true);
    expect(created.body).toMatchObject({ room: { creatorId: guestId, status: 'lobby', members: [{ guestId, nickname: 'Alice' }] } });
  });

  it('rejects a missing token, a bad nickname and a start by a non-creator', () => {
    const { mock, auth } = setup();
    expect(mock.http('GET', '/api/rooms', undefined, undefined)).toMatchObject({ status: 401, body: { code: 'UNAUTHENTICATED' } });
    expect(mock.http('POST', '/api/guests', undefined, { nickname: ' x ' })).toMatchObject({ status: 400, body: { code: 'INVALID_REQUEST' } });
    const demo = (mock.http('GET', '/api/rooms', auth, undefined).body as { rooms: { roomId: string }[] }).rooms[0]!;
    expect(mock.http('POST', `/api/rooms/${demo.roomId}/start`, auth, undefined)).toMatchObject({ status: 403, body: { code: 'NOT_ROOM_CREATOR' } });
    expect(mock.http('POST', '/api/rooms/nope/join', auth, undefined)).toMatchObject({ status: 404, body: { code: 'ROOM_UNAVAILABLE' } });
  });
});

describe('mock socket', () => {
  it('answers protocol errors for bad Hello frames and malformed text', () => {
    const { mock, token, hello } = setup();
    const p = peer();
    mock.message(p.mockPeer, 'garbage');
    mock.message(p.mockPeer, JSON.stringify({ t: 'Hello', protocolVersion: 99, token, gameId: 'r1', lastRevision: null }));
    mock.message(p.mockPeer, JSON.stringify({ t: 'Hello', protocolVersion: 1, token: 'nope', gameId: 'r1', lastRevision: null }));
    hello(p, 'missing');
    hello(p, 'r2'); // the seeded demo room: not a member
    expect(p.frames.map((f) => (f.t === 'Error' ? f.code : f.t))).toEqual([
      'MALFORMED_FRAME',
      'PROTOCOL_VERSION_UNSUPPORTED',
      'UNAUTHENTICATED',
      'ROOM_UNAVAILABLE',
      'NOT_A_PARTICIPANT',
    ]);
  });

  it('feeds the room view over the socket: a bot joins, the creator starts', () => {
    const { mock, auth, guestId, timers, hello } = setup();
    const { room } = mock.http('POST', '/api/rooms', auth, undefined).body as { room: { roomId: string } };
    const p = peer();
    hello(p, room.roomId);
    expect(p.frames[0]).toMatchObject({ t: 'Welcome', playerId: guestId, view: { phase: 'lobby', players: [{ id: guestId }] } });
    expect(mock.http('POST', `/api/rooms/${room.roomId}/start`, auth, undefined)).toMatchObject({ status: 409 });

    timers.advance(2000);
    expect(p.eventTypes()).toEqual(['PlayerAdded']);
    expect(p.view().players).toHaveLength(2);
    expect(mock.http('POST', `/api/rooms/${room.roomId}/start`, auth, undefined).status).toBe(200);
    expect(p.eventTypes()).toEqual(['PlayerAdded', 'GameStarted', 'OrderRollStarted']);
    expect(p.view().phase).toBe('setup');
    // A started room is no longer joinable.
    const listed = (mock.http('GET', '/api/rooms', auth, undefined).body as { rooms: { roomId: string }[] }).rooms;
    expect(listed.map((r) => r.roomId)).not.toContain(room.roomId);
  });

  it('replays the scripted game: tie, move, doubles, jail, failed attempt, release', () => {
    const { mock, auth, guestId, timers, hello, act } = setup();
    const { room } = mock.http('POST', '/api/rooms', auth, undefined).body as { room: { roomId: string } };
    const p = peer();
    hello(p, room.roomId);
    timers.advance(2000);
    mock.http('POST', `/api/rooms/${room.roomId}/start`, auth, undefined);

    for (let i = 0; i < 80; i++) {
      if (!act(p)) timers.advance(1600);
    }

    const types = p.eventTypes();
    for (const type of [
      'OrderDieRolled',
      'OrderTied',
      'TurnOrderDetermined',
      'TurnStarted',
      'DiceRolled',
      'PlayerMoved',
      'TurnEnded',
      'SentToJail',
      'InterimJailAttemptFailed',
      'InterimJailReleased',
    ]) {
      expect(types, type).toContain(type);
    }
    // Every command got exactly one Ack, all accepted: the human only acted when the view allowed.
    const acks = p.frames.filter((f) => f.t === 'Ack');
    expect(acks.length).toBeGreaterThan(10);
    expect(acks.every((a) => a.t === 'Ack' && a.outcome === 'accepted')).toBe(true);
    // Revisions only grow, and every view names positions on the ring for both players.
    const revisions = p.frames.flatMap((f) => (f.t === 'Update' ? [f.revision] : []));
    expect([...revisions].sort((a, b) => a - b)).toEqual(revisions);
    expect(new Set(revisions).size).toBe(revisions.length);
    const view = p.view();
    expect(view.phase).toBe('playing');
    expect(Object.keys(view.positions).sort()).toEqual(view.players.map((pl) => pl.id).sort());
    // The client turns every scripted event into steps without throwing; a bonus turn was shown.
    const updates = p.frames.flatMap((f) => (f.t === 'Update' ? [f] : []));
    expect(updates.flatMap((u) => stepsForEvents(u.events, 40)).length).toBeGreaterThan(50);
    expect(updates.some((u) => u.events.some((e) => e.type === 'TurnStarted' && (e.payload as { bonus: boolean }).bonus))).toBe(true);
    expect(guestId).toBe(view.players[0]!.id);
  });

  it('rejects a stale target, a wrong player and answers a resent command with its first Ack', () => {
    const { mock, auth, timers, hello, say, act } = setup();
    const { room } = mock.http('POST', '/api/rooms', auth, undefined).body as { room: { roomId: string } };
    const p = peer();
    hello(p, room.roomId);
    timers.advance(2000);
    mock.http('POST', `/api/rooms/${room.roomId}/start`, auth, undefined);

    const stale = { t: 'Command', commandId: 'x1', type: 'RollForOrder', expected: { kind: 'target', target: { kind: 'setupRoll', id: 'old' } }, payload: null } as unknown as ClientFrame;
    say(p, stale);
    expect(p.frames[p.frames.length - 1]).toMatchObject({ t: 'Ack', commandId: 'x1', outcome: 'rejected', error: { code: 'TARGET_MISMATCH' } });

    expect(act(p)).toBe(true); // the human rolls for order (c1)
    const first = p.frames.find((f) => f.t === 'Ack' && f.commandId === 'c1');
    const updatesBefore = p.frames.filter((f) => f.t === 'Update').length;
    say(p, { t: 'Command', commandId: 'c1', type: 'RollForOrder', expected: { kind: 'target', target: { kind: 'setupRoll', id: 'whatever' } }, payload: null } as unknown as ClientFrame);
    expect(p.frames[p.frames.length - 1]).toEqual(first);
    expect(p.frames.filter((f) => f.t === 'Update').length).toBe(updatesBefore);

    // Now it is the bot's order roll: the human may not roll.
    const view = p.view();
    say(p, { t: 'Command', commandId: 'x2', type: 'RollForOrder', expected: { kind: 'target', target: { kind: 'setupRoll', id: view.setup!.setupRollId } }, payload: null } as unknown as ClientFrame);
    expect(p.frames[p.frames.length - 1]).toMatchObject({ outcome: 'rejected', error: { code: 'NOT_ACTIVE_PLAYER' } });
  });

  it('times out an idle human: auto roll, continuation with a new deadline, then the turn closes', () => {
    const { mock, auth, guestId, timers, hello } = setup(5000);
    const demo = (mock.http('GET', '/api/rooms', auth, undefined).body as { rooms: { roomId: string }[] }).rooms[0]!;
    mock.http('POST', `/api/rooms/${demo.roomId}/join`, auth, undefined);
    const p = peer();
    hello(p, demo.roomId);
    timers.advance(2000); // the bot host starts the game
    expect(p.view().phase).toBe('setup');

    timers.advance(120_000);
    const auto = p.frames.flatMap((f) => (f.t === 'Update' ? f.events : [])).filter((e) => (e.payload as { playerId?: string; auto?: boolean }).playerId === guestId && (e.payload as { auto?: boolean }).auto === true);
    expect(auto.map((e) => e.type)).toEqual(expect.arrayContaining(['OrderDieRolled', 'DiceRolled']));
    expect(p.eventTypes()).toContain('TurnContinued');
    const ended = p.frames.flatMap((f) => (f.t === 'Update' ? f.events : [])).filter((e) => e.type === 'TurnEnded').map((e) => (e.payload as { reason: string }).reason);
    expect(ended).toContain('timeout');
    // A new demo room replaced the started one.
    const listed = (mock.http('GET', '/api/rooms', auth, undefined).body as { rooms: { roomId: string }[] }).rooms;
    expect(listed).toHaveLength(1);
    expect(listed[0]!.roomId).not.toBe(demo.roomId);
  });

  it('drops every socket on request and welcomes a reconnect with the current view', () => {
    const { mock, auth, token, hello } = setup();
    const { room } = mock.http('POST', '/api/rooms', auth, undefined).body as { room: { roomId: string } };
    const p = peer();
    hello(p, room.roomId);
    expect(mock.dropAll()).toBe(1);
    expect(p.closed).toBe(true);
    const again = peer();
    mock.message(again.mockPeer, JSON.stringify({ t: 'Hello', protocolVersion: 1, token, gameId: room.roomId, lastRevision: 2 }));
    expect(again.frames[0]).toMatchObject({ t: 'Welcome', revision: again.view().revision });
  });
});
