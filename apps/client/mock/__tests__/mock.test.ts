// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { Value } from '@sinclair/typebox/value';
import {
  PROTOCOL_VERSION,
  CreateRoomResponseSchema,
  GuestLoginResponseSchema,
  ListRoomsResponseSchema,
  decodeServerFrame,
  type ClientFrame,
  type ClientCommandType,
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

function setup(turnMs = 45_000, automateSeats = true) {
  const timers = fakeTimers();
  const mock = new MockServer({ turnMs, continuationMs: Math.min(20_000, turnMs), timers, automateSeats });
  const login = mock.http('POST', '/api/guests', undefined, { nickname: 'Alice' });
  if (!Value.Check(GuestLoginResponseSchema, login.body)) throw new Error('bad login response');
  const { guestId, token } = login.body;
  const auth = `Bearer ${token}`;
  const say = (p: ReturnType<typeof peer>, frame: ClientFrame): void => mock.message(p.mockPeer, JSON.stringify(frame));
  const hello = (p: ReturnType<typeof peer>, gameId: string): void =>
    say(p, { t: 'Hello', protocolVersion: PROTOCOL_VERSION, token, gameId, lastRevision: null });
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
      const type = view.purchase ? 'BuyAsset' : view.turn.rolled ? 'EndTurn' : 'RollDice';
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
    mock.message(p.mockPeer, JSON.stringify({ t: 'Hello', protocolVersion: PROTOCOL_VERSION, token: 'nope', gameId: 'r1', lastRevision: null }));
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
    expect(p.eventTypes()).toEqual(['PlayerAdded', 'GameStarted', 'BalanceChanged', 'BalanceChanged', 'OrderRollStarted']);
    expect(p.view().phase).toBe('setup');
    // A started room is no longer joinable.
    const listed = (mock.http('GET', '/api/rooms', auth, undefined).body as { rooms: { roomId: string }[] }).rooms;
    expect(listed.find((r) => r.roomId === room.roomId)).toMatchObject({ status: 'playing', joinable: false });
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
    expect(listed).toHaveLength(2);
    expect(listed.find((r) => r.roomId === demo.roomId)).toMatchObject({ status: 'playing', joinable: false });
  });

  it('drops every socket on request and welcomes a reconnect with the current view', () => {
    const { mock, auth, token, hello } = setup();
    const { room } = mock.http('POST', '/api/rooms', auth, undefined).body as { room: { roomId: string } };
    const p = peer();
    hello(p, room.roomId);
    expect(mock.dropAll()).toBe(1);
    expect(p.closed).toBe(true);
    const again = peer();
    mock.message(again.mockPeer, JSON.stringify({ t: 'Hello', protocolVersion: PROTOCOL_VERSION, token, gameId: room.roomId, lastRevision: 2 }));
    expect(again.frames[0]).toMatchObject({ t: 'Welcome', revision: again.view().revision });
  });
});

describe('mock revision-3 lifecycle', () => {
  it('locked create returns private details, get/list omit them, join checks codes, non-creator leave refreshes roster', () => {
    const { mock, auth } = setup();
    const created = mock.http('POST', '/api/rooms', auth, { accessCode: 'abcd' });
    expect(Value.Check(CreateRoomResponseSchema, created.body)).toBe(true);
    const { room } = created.body as { room: { roomId: string } };
    const path = `/api/rooms/${room.roomId}`;
    expect(created.body).toMatchObject({ accessCode: 'abcd', inviteLink: `/?room=${room.roomId}&code=abcd`, room: { locked: true, joinable: false } });
    expect(mock.http('GET', path, auth, undefined).body).not.toHaveProperty('accessCode');
    expect(mock.http('GET', '/api/rooms', auth, undefined).body).not.toHaveProperty('accessCode');
    const bob = mock.http('POST', '/api/guests', undefined, { nickname: 'Bob' }).body as { token: string };
    const bobAuth = `Bearer ${bob.token}`;
    expect(mock.http('POST', `${path}/join`, bobAuth, undefined)).toMatchObject({ status: 403, body: { code: 'ACCESS_CODE_REQUIRED' } });
    expect(mock.http('POST', `${path}/join`, bobAuth, { accessCode: 'wrong' })).toMatchObject({ status: 403, body: { code: 'ACCESS_CODE_INVALID' } });
    expect(mock.http('POST', `${path}/join`, bobAuth, { accessCode: 'abcd' }).status).toBe(200);
    expect(mock.http('POST', `${path}/leave`, bobAuth, undefined)).toMatchObject({ status: 200, body: { room: { status: 'lobby', members: [{ nickname: 'Alice' }] } } });
    expect(mock.http('GET', path, bobAuth, undefined)).toMatchObject({ status: 403, body: { code: 'NOT_A_PARTICIPANT' } });
  });

  it('creator leave closes every peer and cancels later bot joins', () => {
    const { mock, auth, timers, hello } = setup();
    const { room } = mock.http('POST', '/api/rooms', auth, undefined).body as { room: { roomId: string } };
    const a = peer(); hello(a, room.roomId);
    const bob = mock.http('POST', '/api/guests', undefined, { nickname: 'Bob' }).body as { token: string };
    mock.http('POST', `/api/rooms/${room.roomId}/join`, `Bearer ${bob.token}`, undefined);
    const b = peer(); mock.message(b.mockPeer, JSON.stringify({ t: 'Hello', protocolVersion: PROTOCOL_VERSION, token: bob.token, gameId: room.roomId, lastRevision: null }));
    mock.http('POST', `/api/rooms/${room.roomId}/leave`, auth, undefined);
    expect(a.frames.at(-1)).toMatchObject({ t: 'Error', code: 'NOT_A_PARTICIPANT' });
    expect(b.frames.at(-1)).toMatchObject({ t: 'Error', code: 'ROOM_CLOSED' });
    expect(a.closed).toBe(true); expect(b.closed).toBe(true);
    timers.advance(2000);
    expect(mock.http('GET', `/api/rooms/${room.roomId}`, `Bearer ${bob.token}`, undefined).body).toMatchObject({ room: { status: 'closed', members: [{ nickname: 'Bob' }] } });
  });

  it('replacement closes only the old peer; transport drop does not eliminate anyone', () => {
    const { mock, auth, hello } = setup();
    const { room } = mock.http('POST', '/api/rooms', auth, undefined).body as { room: { roomId: string } };
    const old = peer(); hello(old, room.roomId); const next = peer(); hello(next, room.roomId);
    expect(old.frames.at(-1)).toMatchObject({ t: 'Error', code: 'CONNECTION_REPLACED' }); expect(old.closed).toBe(true);
    mock.disconnect(old.mockPeer); expect(mock.dropAll()).toBe(1);
    const again = peer(); hello(again, room.roomId); expect(again.view().eliminated).toEqual([]);
  });

  it.each(['setup', 'playing'] as const)('resignation in %s keeps a three-player spectator, then publishes the winner to everyone', (phase) => {
    const { mock, auth, guestId, timers, hello, say, act } = setup();
    const { room } = mock.http('POST', '/api/rooms', auth, undefined).body as { room: { roomId: string } };
    const bob = mock.http('POST', '/api/guests', undefined, { nickname: 'Bob' }).body as { token: string; guestId: string };
    mock.http('POST', `/api/rooms/${room.roomId}/join`, `Bearer ${bob.token}`, undefined);
    timers.advance(2000); // third seat is bot Ada
    const a = peer(); hello(a, room.roomId);
    const b = peer(); mock.message(b.mockPeer, JSON.stringify({ t: 'Hello', protocolVersion: PROTOCOL_VERSION, token: bob.token, gameId: room.roomId, lastRevision: null }));
    mock.http('POST', `/api/rooms/${room.roomId}/start`, auth, undefined);
    if (phase === 'playing') for (let i = 0; i < 100 && a.view().phase !== 'playing'; i++) {
      if (!act(a)) timers.advance(45001); // timeout Bob, bot Ada rolls itself
    }
    expect(a.view().phase).toBe(phase);
    say(a, { t: 'Command', commandId: 'stale-resign', type: 'Resign', payload: null, expected: { kind: 'revision', revision: 0 } } as never);
    expect(a.frames.at(-1)).toMatchObject({ outcome: 'rejected', error: { code: 'REVISION_MISMATCH' } });
    say(a, { t: 'Command', commandId: 'resign-a', type: 'Resign', payload: null, expected: { kind: 'revision', revision: a.view().revision } } as never);
    expect(a.view().eliminated).toEqual([guestId]); expect(a.closed).toBe(false); expect(a.view().phase).not.toBe('finished');
    say(b, { t: 'Command', commandId: 'resign-b', type: 'Resign', payload: null, expected: { kind: 'revision', revision: b.view().revision } } as never);
    for (const p of [a, b]) { expect(p.view().phase).toBe('finished'); expect(p.view().winner).not.toBeNull(); expect(p.eventTypes()).toContain('GameEnded'); }
    expect(mock.http('GET', `/api/rooms/${room.roomId}`, auth, undefined).body).toMatchObject({ room: { status: 'finished', joinable: false } });
  });

  it('two-player setup resignation finishes immediately without needing positions', () => {
    const { mock, auth, timers, hello, say } = setup();
    const { room } = mock.http('POST', '/api/rooms', auth, undefined).body as { room: { roomId: string } };
    timers.advance(2000); const p = peer(); hello(p, room.roomId);
    mock.http('POST', `/api/rooms/${room.roomId}/start`, auth, undefined);
    say(p, { t: 'Command', commandId: 'resign', type: 'Resign', payload: null, expected: { kind: 'revision', revision: p.view().revision } } as never);
    expect(p.view()).toMatchObject({ phase: 'finished', positions: {}, setup: null, turn: null });
  });
});

describe('stage 2 mock economy', () => {
  it('projects generated cells and capital, then credits lap rewards in event order', async () => {
    const { MockGame } = await import('../game');
    const { startingCapital, lapReward } = await import('@game/game-core');
    const game = new MockGame({ turnMs: 45000, continuationMs: 20000 });
    game.addPlayer('a'); game.addPlayer('b');
    const started = game.start(0);
    expect(game.view.board?.cells).toHaveLength(40);
    expect(game.view.balances).toEqual({ a: startingCapital(2), b: startingCapital(2) });
    expect(started.filter(e => e.type === 'BalanceChanged')).toHaveLength(2);
    let sawLap = false;
    for (let n = 0; n < 400 && !sawLap; n++) {
      const view = game.view;
      const player = view.setup?.playerId ?? view.turn!.playerId;
      const type = view.purchase ? 'BuyAsset' : view.setup ? 'RollForOrder' : view.turn!.rolled ? 'EndTurn' : 'RollDice';
      const id = view.setup?.setupRollId ?? view.turn!.turnId;
      const result = game.command(player, type, { kind: 'target', target: { kind: view.setup ? 'setupRoll' : 'turn', id } }, 1);
      expect(result.ok).toBe(true);
      if (!result.ok) break;
      for (const [i, event] of result.events.entries()) if (event.type === 'BalanceChanged' && (event.payload as { reason: string }).reason === 'lap-reward') {
        const payload = event.payload as { playerId: string; balance: number; delta: number; reason: string };
        expect(payload.reason).toBe('lap-reward'); expect(payload.delta).toBe(lapReward(startingCapital(2)));
        expect(result.events[i - 1]?.type).toBe('PlayerMoved');
        expect(game.view.balances[payload.playerId]).toBe(payload.balance); sawLap = true;
      }
    }
    expect(sawLap).toBe(true);
  });
});

describe('decoded stage 3 mock socket script', () => {
  it('broadcasts purchase, outbid, pass, timeout and unsold views with the shown next amount', async () => {
    const { nextBidAmount } = await import('@game/game-core');
    const { mock, auth, guestId, token, timers } = setup(45_000, false);
    const created = mock.http('POST', '/api/rooms', auth, {});
    if (!Value.Check(CreateRoomResponseSchema, created.body)) throw Error('bad create');
    const roomId = created.body.room.roomId;
    const seats = [{ guestId, token, p: peer() }];
    for (const nickname of ['Bob', 'Charlie']) {
      const login = mock.http('POST', '/api/guests', undefined, { nickname });
      if (!Value.Check(GuestLoginResponseSchema, login.body)) throw Error('bad login');
      mock.http('POST', `/api/rooms/${roomId}/join`, `Bearer ${login.body.token}`, {});
      seats.push({ ...login.body, p: peer() });
    }
    for (const seat of seats) mock.message(seat.p.mockPeer, JSON.stringify({ t: 'Hello', protocolVersion: PROTOCOL_VERSION, token: seat.token, gameId: roomId, lastRevision: null }));
    mock.http('POST', `/api/rooms/${roomId}/start`, auth, {});
    let id = 0;
    function send(type: ClientCommandType) {
      const v = seats[0]!.p.view(); const a = v.auction; const s = v.setup; const t = v.turn!;
      const seat = seats.find(seat => seat.guestId === (a?.responder ?? s?.playerId ?? t.playerId))!;
      const commandId = `stage3-${++id}`;
      mock.message(seat.p.mockPeer, JSON.stringify({ t: 'Command', commandId, type, payload: null, expected: { kind: 'target', target: a ? { kind: 'auctionResponse', id: a.responseId } : s ? { kind: 'setupRoll', id: s.setupRollId } : { kind: 'turn', id: t.turnId } } }));
      expect(seat.p.frames.find(frame => frame.t === 'Ack' && frame.commandId === commandId)).toMatchObject({ outcome: 'accepted' });
    }
    while (seats[0]!.p.view().setup) send('RollForOrder');
    send('RollDice'); expect(seats[0]!.p.view().purchase).not.toBeNull(); send('StartAuction');
    const initial = seats[0]!.p.view().auction!;
    expect(nextBidAmount(initial)).toBe(initial.startBid); send('Bid');
    expect(nextBidAmount(seats[0]!.p.view().auction!)).toBe(initial.startBid + initial.step); send('Bid'); send('PassAuction');
    const winningLeader = seats[0]!.p.view().auction!.leader;
    // Invoke the response deadline through the mock scheduler (no local outcome).
    timers.advance(10_000);
    expect(seats[0]!.p.eventTypes()).toContain('AuctionWon');
    expect(seats[0]!.p.view().owners[initial.assetId]).toBe(winningLeader);
    expect(seats[0]!.p.view().auction).toBeNull();
    // Seek the next free asset, pass every response and observe unsold settlement.
    for (let n = 0; n < 60 && seats[0]!.p.view().purchase === null; n++) {
      send(seats[0]!.p.view().turn!.rolled ? 'EndTurn' : 'RollDice');
    }
    expect(seats[0]!.p.view().purchase).not.toBeNull(); send('StartAuction');
    const assetId = seats[0]!.p.view().auction!.assetId;
    while (seats[0]!.p.view().auction) send('PassAuction');
    expect(seats[0]!.p.eventTypes()).toContain('AuctionEndedUnsold'); expect(seats[0]!.p.view().owners[assetId]).toBeUndefined();
  });
});
