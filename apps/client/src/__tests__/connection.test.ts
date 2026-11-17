import { PROTOCOL_VERSION } from '@game/protocol';
import { flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decodeClientFrame, type ServerFrame } from '@game/protocol';
import { RECONNECT_DELAYS_MS } from '../shared/api/index';
import { GUEST, harness, lobbyView, playingView, room, setupView, storedSession, update, welcome, type Harness } from './helpers';

const ROOM = room([['a', 'Alice'], ['b', 'Bob']]);

/** A logged-in client in room r1, connected and welcomed with `view`. */
function joined(view = playingView(['a', 'b'], { owner: 'a', turnId: 't7', revision: 20 })): Harness {
  const h = harness({ stored: storedSession(ROOM) });
  h.client.start();
  h.sockets.last().open();
  h.sockets.last().receive(welcome(view));
  return h;
}

const ack = (commandId: string, revision = 21): ServerFrame =>
  ({ t: 'Ack', commandId, outcome: 'accepted', revision }) as ServerFrame;
const rejected = (commandId: string, code: string, message: string): ServerFrame =>
  ({ t: 'Ack', commandId, outcome: 'rejected', revision: 20, error: { code, message } }) as ServerFrame;

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('handshake', () => {
  it('first connect sends Hello with the token, the room and lastRevision null', () => {
    const h = harness({ stored: storedSession(ROOM) });
    h.client.start();
    expect(h.sockets.sockets).toHaveLength(1);
    expect(h.sockets.last().url).toBe('ws://test/ws');
    expect(h.sockets.last().sent).toEqual([]);
    h.sockets.last().open();
    expect(h.sockets.last().sent).toEqual([
      { t: 'Hello', protocolVersion: PROTOCOL_VERSION, token: GUEST.token, gameId: 'r1', lastRevision: null },
    ]);
    expect(decodeClientFrame(JSON.stringify(h.sockets.last().sent[0])).ok).toBe(true);
    expect(h.client.game.connected).toBe(false);
  });

  it('Welcome sets the player id and replaces the view', () => {
    const view = playingView(['a', 'b'], { revision: 12, positions: { a: 3, b: 8 } });
    const h = joined(view);
    expect(h.client.game.connected).toBe(true);
    expect(h.client.game.playerId).toBe('a');
    expect(h.client.game.view).toEqual(view);
  });

  it('does not connect without a stored room', () => {
    const h = harness({ stored: storedSession() });
    h.client.start();
    expect(h.sockets.sockets).toHaveLength(0);
  });
});

describe('frames go through the protocol', () => {
  it('drops a malformed message and reports a connection problem', () => {
    const h = joined();
    const before = h.client.game.view;
    for (const raw of ['not json', '{"t":"Update"}', '{"t":"Welcome","view":{}}', '{"t":"Nope"}', '[]']) {
      h.sockets.last().receive(raw);
    }
    expect(h.client.game.view).toEqual(before);
    expect(h.client.game.problem).toMatch(/Unreadable message/);
    expect(h.client.game.connected).toBe(true);
  });

  it('drops a frame with an unknown property', () => {
    const h = joined();
    const next = playingView(['a', 'b'], { revision: 21 });
    h.sockets.last().receive(JSON.stringify({ ...update(next), extra: true }));
    expect(h.client.game.view?.revision).toBe(20);
  });
});

describe('updates', () => {
  it('a newer update replaces the view and queues its events', () => {
    const h = joined();
    h.client.attachBoard(h.board);
    const next = playingView(['a', 'b'], { revision: 21, rolled: true, positions: { a: 7, b: 0 } });
    h.sockets.last().receive(
      update(next, [{ type: 'DiceRolled', payload: { turnId: 't7', playerId: 'a', dice: [3, 4], double: false, auto: false } }]),
    );
    expect(h.client.game.view).toEqual(next);
    expect(h.board.steps).toEqual([{ kind: 'dice', playerId: 'a', dice: [3, 4] }]);
  });

  it('takes the held revision from the frame field, not from inside the view', () => {
    const h = joined();
    const view = { ...playingView(['a', 'b'], { revision: 21 }), revision: 999 };
    h.sockets.last().receive(JSON.stringify({ t: 'Update', revision: 21, view, events: [] }));
    h.sockets.last().drop();
    vi.advanceTimersByTime(RECONNECT_DELAYS_MS[0]);
    h.sockets.last().open();
    expect(h.sockets.last().sent[0]).toMatchObject({ t: 'Hello', lastRevision: 21 });
  });

  it('ignores an update at or below the held revision', () => {
    const h = joined();
    h.client.attachBoard(h.board);
    const before = h.client.game.view;
    const events = [{ type: 'DiceRolled', payload: { turnId: 't7', playerId: 'a', dice: [3, 4], double: false, auto: false } }];
    h.sockets.last().receive(update(playingView(['a', 'b'], { revision: 20, rolled: true }), events));
    h.sockets.last().receive(update(playingView(['a', 'b'], { revision: 19, rolled: true }), events));
    expect(h.client.game.view).toEqual(before);
    expect(h.board.steps).toEqual([]);
  });
});

describe('intents only', () => {
  it('RollDice names the turn from the view and passes the protocol decoder', () => {
    const h = joined();
    expect(h.client.connection.sendCommand('RollDice')).toBe(true);
    const frame = h.sockets.last().sent[1];
    expect(frame).toEqual({
      t: 'Command',
      commandId: 'c1',
      type: 'RollDice',
      expected: { kind: 'target', target: { kind: 'turn', id: 't7' } },
      payload: null,
    });
    expect(Object.keys(frame!).sort()).toEqual(['commandId', 'expected', 'payload', 't', 'type']);
    expect(frame).not.toHaveProperty('actor');
    expect(decodeClientFrame(JSON.stringify(frame)).ok).toBe(true);
  });

  it('RollForOrder names the setup roll', () => {
    const h = joined(setupView(['a', 'b'], { roller: 'a', setupRollId: 's4' }));
    h.client.connection.sendCommand('RollForOrder');
    expect(h.sockets.last().sent[1]).toMatchObject({
      type: 'RollForOrder',
      expected: { kind: 'target', target: { kind: 'setupRoll', id: 's4' } },
    });
  });

  it('sends nothing when the view has no target for the command', () => {
    const h = joined(lobbyView(['a', 'b']));
    expect(h.client.connection.sendCommand('RollDice')).toBe(false);
    expect(h.sockets.last().sent).toHaveLength(1);
    expect(h.client.game.pending).toEqual([]);
  });

  it('does not issue a second command of a type while one is pending', () => {
    const h = joined();
    h.client.connection.sendCommand('RollDice');
    expect(h.client.connection.sendCommand('RollDice')).toBe(false);
    expect(h.sockets.last().sent.filter((f) => f.t === 'Command')).toHaveLength(1);
  });

  it('does not change the view when a command is sent or accepted', () => {
    const h = joined();
    const before = JSON.stringify(h.client.game.view);
    h.client.connection.sendCommand('RollDice');
    h.sockets.last().receive(ack('c1'));
    expect(JSON.stringify(h.client.game.view)).toBe(before);
    expect(h.client.game.pending).toEqual([]);
    expect(h.client.game.messages).toEqual([]);
  });
});

describe('acknowledgements', () => {
  it('a rejected Ack clears the pending command and shows code and message', () => {
    const h = joined();
    h.client.connection.sendCommand('RollDice');
    expect(h.client.game.pending.map((c) => c.commandId)).toEqual(['c1']);
    h.sockets.last().receive(rejected('c1', 'DEADLINE_PASSED', 'Turn t7 expired'));
    expect(h.client.game.pending).toEqual([]);
    expect(h.client.game.messages).toMatchObject([{ code: 'DEADLINE_PASSED', message: 'Turn t7 expired' }]);
    h.client.connection.dismissMessage(h.client.game.messages[0]!.id);
    expect(h.client.game.messages).toEqual([]);
  });

  it('ignores an Ack for an unknown command', () => {
    const h = joined();
    h.client.connection.sendCommand('RollDice');
    h.sockets.last().receive(rejected('other', 'X', 'y'));
    expect(h.client.game.pending).toHaveLength(1);
    expect(h.client.game.messages).toEqual([]);
  });
});

describe('reconnect', () => {
  it('socket drop mid-turn: Hello carries the held revision and the Welcome view is shown', () => {
    const h = joined();
    h.client.attachBoard(h.board);
    h.sockets.last().drop();
    expect(h.client.game.connected).toBe(false);
    expect(h.sockets.sockets).toHaveLength(1);

    vi.advanceTimersByTime(RECONNECT_DELAYS_MS[0]);
    expect(h.sockets.sockets).toHaveLength(2);
    h.sockets.last().open();
    expect(h.sockets.last().sent).toEqual([
      { t: 'Hello', protocolVersion: PROTOCOL_VERSION, token: GUEST.token, gameId: 'r1', lastRevision: 20 },
    ]);

    const current = playingView(['a', 'b'], { revision: 23, owner: 'b', turnId: 't22', positions: { a: 7, b: 0 } });
    h.sockets.last().receive(welcome(current));
    expect(h.client.game.connected).toBe(true);
    expect(h.client.game.view).toEqual(current);
    expect(h.board.snaps[h.board.snaps.length - 1]).toEqual({ positions: { a: 7, b: 0 }, activeId: 'b' });
  });

  it('a pending command survives a drop with the same commandId, sent once after Welcome', () => {
    const h = joined();
    h.client.connection.sendCommand('RollDice');
    const original = h.sockets.last().sent[1];
    h.sockets.last().drop();
    vi.advanceTimersByTime(RECONNECT_DELAYS_MS[0]);
    h.sockets.last().open();
    // Nothing but Hello before Welcome.
    expect(h.sockets.last().sent.map((f) => f.t)).toEqual(['Hello']);
    h.sockets.last().receive(welcome(playingView(['a', 'b'], { owner: 'a', turnId: 't7', revision: 20 })));
    const commands = h.sockets.last().sent.filter((f) => f.t === 'Command');
    expect(commands).toEqual([original]);
    expect(commands[0]).toMatchObject({ commandId: 'c1' });
  });

  it('a command issued while offline is sent after Welcome, once', () => {
    const h = joined();
    h.sockets.last().drop();
    expect(h.client.connection.sendCommand('RollDice')).toBe(true);
    vi.advanceTimersByTime(RECONNECT_DELAYS_MS[0]);
    h.sockets.last().open();
    h.sockets.last().receive(welcome(playingView(['a', 'b'], { owner: 'a', turnId: 't7', revision: 20 })));
    expect(h.sockets.sockets[0]!.sent.filter((f) => f.t === 'Command')).toEqual([]);
    expect(h.sockets.last().sent.filter((f) => f.t === 'Command').map((f) => f.commandId)).toEqual(['c1']);
  });

  it('an acknowledged command is not resent', () => {
    const h = joined();
    h.client.connection.sendCommand('RollDice');
    h.sockets.last().receive(ack('c1'));
    h.sockets.last().drop();
    vi.advanceTimersByTime(RECONNECT_DELAYS_MS[0]);
    h.sockets.last().open();
    h.sockets.last().receive(welcome(playingView(['a', 'b'], { revision: 21, rolled: true })));
    expect(h.sockets.last().sent.map((f) => f.t)).toEqual(['Hello']);
  });

  it('retries after 0.5 s, then every 1 s up to 19.5 s, then 2 s and 5 s, and starts over after a Welcome', () => {
    const h = joined();
    h.sockets.last().drop();
    const schedule = [500, ...Array<number>(19).fill(1000), 2000, 5000, 5000];
    // No gap above 1 s during the first 20 s after the drop.
    expect(schedule.slice(0, 20).reduce((sum, d) => sum + d, 0)).toBe(19_500);
    for (const [i, delay] of schedule.entries()) {
      vi.advanceTimersByTime(delay - 1);
      expect(h.sockets.sockets).toHaveLength(1 + i);
      vi.advanceTimersByTime(1);
      expect(h.sockets.sockets).toHaveLength(2 + i);
      h.sockets.last().drop();
    }
    vi.advanceTimersByTime(5000);
    h.sockets.last().open();
    h.sockets.last().receive(welcome(playingView(['a', 'b'], { revision: 20 })));
    h.sockets.last().drop();
    const count = h.sockets.sockets.length;
    vi.advanceTimersByTime(500);
    expect(h.sockets.sockets).toHaveLength(count + 1);
  });

  it('after a tab reload it reconnects to the stored room with lastRevision null', () => {
    const first = joined();
    const reloaded = harness({ stored: Object.fromEntries(first.storage.data) });
    reloaded.client.start();
    reloaded.sockets.last().open();
    expect(reloaded.sockets.last().sent).toEqual([
      { t: 'Hello', protocolVersion: PROTOCOL_VERSION, token: GUEST.token, gameId: 'r1', lastRevision: null },
    ]);
  });

  it('ignores late callbacks of an abandoned socket', () => {
    const h = joined();
    const old = h.sockets.last();
    h.client.connection.disconnect();
    expect(old.closed).toBe(true);
    old.receive(welcome(playingView(['a', 'b'], { revision: 30 })));
    old.drop();
    vi.advanceTimersByTime(10_000);
    expect(h.client.game.view).toBeNull();
    expect(h.sockets.sockets).toHaveLength(1);
  });
});

describe('server errors', () => {
  const error = (code: string): ServerFrame => ({ t: 'Error', code, message: `${code} happened` });

  it('UNAUTHENTICATED clears the guest and stops', () => {
    const h = joined();
    h.sockets.last().receive(error('UNAUTHENTICATED'));
    expect(h.client.session.state).toEqual({ guest: null, room: null });
    expect(h.storage.data.size).toBe(0);
    expect(h.client.game.view).toBeNull();
    vi.advanceTimersByTime(10_000);
    expect(h.sockets.sockets).toHaveLength(1);
  });

  it.each(['NOT_A_PARTICIPANT', 'ROOM_UNAVAILABLE'])('%s forgets the room and returns to the lobby', (code) => {
    const h = joined();
    h.sockets.last().receive(error(code));
    expect(h.client.session.state.room).toBeNull();
    expect(h.client.session.state.guest).toEqual(GUEST);
    expect(h.client.lobby.notice).toContain(code);
    vi.advanceTimersByTime(10_000);
    expect(h.sockets.sockets).toHaveLength(1);
  });

  it('PROTOCOL_VERSION_UNSUPPORTED stops reconnecting and asks for a reload', () => {
    const h = joined();
    h.sockets.last().receive(error('PROTOCOL_VERSION_UNSUPPORTED'));
    expect(h.client.game.fatal).toMatch(/Reload/);
    expect(h.sockets.last().closed).toBe(true);
    vi.advanceTimersByTime(10_000);
    expect(h.sockets.sockets).toHaveLength(1);
    expect(h.client.session.state.room).not.toBeNull();
  });

  it('any other code is shown and the connection stays', () => {
    const h = joined();
    h.sockets.last().receive(error('MALFORMED_FRAME'));
    expect(h.client.game.messages).toMatchObject([{ code: 'MALFORMED_FRAME' }]);
    expect(h.client.game.connected).toBe(true);
  });
});

describe('board follows the view', () => {
  it('Welcome during an animation drops the waiting steps and snaps to its positions', async () => {
    const h = joined();
    let release: () => void = () => {};
    const played: string[] = [];
    h.client.attachBoard({
      ...h.board,
      play: (step) => {
        played.push(step.kind);
        return new Promise<void>((resolve) => (release = resolve));
      },
    });
    h.sockets.last().receive(
      update(playingView(['a', 'b'], { revision: 21, rolled: true, positions: { a: 7, b: 0 } }), [
        { type: 'DiceRolled', payload: { turnId: 't7', playerId: 'a', dice: [3, 4], double: false, auto: false } },
        { type: 'PlayerMoved', payload: { playerId: 'a', from: 0, to: 7, steps: 7 } },
      ]),
    );
    expect(played).toEqual(['dice']);

    h.sockets.last().receive(welcome(playingView(['a', 'b'], { revision: 25, positions: { a: 11, b: 4 } })));
    expect(h.board.snaps[h.board.snaps.length - 1]!.positions).toEqual({ a: 11, b: 4 });
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(played).toEqual(['dice']);
  });

  it('snaps to the view when the queue drains and when a board is attached', async () => {
    const h = joined(playingView(['a', 'b'], { revision: 20, positions: { a: 2, b: 0 } }));
    h.client.attachBoard(h.board);
    expect(h.board.snaps).toEqual([{ positions: { a: 2, b: 0 }, activeId: 'a' }]);
    h.sockets.last().receive(
      update(playingView(['a', 'b'], { revision: 21, rolled: true, positions: { a: 5, b: 0 } }), [
        { type: 'PlayerMoved', payload: { playerId: 'a', from: 2, to: 5, steps: 3 } },
      ]),
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(h.board.steps.map((s) => s.kind)).toEqual(['hop', 'hop', 'hop']);
    expect(h.board.snaps[h.board.snaps.length - 1]).toEqual({ positions: { a: 5, b: 0 }, activeId: 'a' });
  });
});

describe('elimination cancels queued motion', () => {
  it('snaps immediately even without resignation events and drops obsolete waiting steps', async () => {
    const h = harness({ stored: storedSession(room([['a', 'Alice'], ['b', 'Bob'], ['c', 'Carol']])) });
    h.client.start(); h.sockets.last().open(); h.sockets.last().receive(welcome(playingView(['a', 'b', 'c'], { revision: 20 })));
    let release = () => {}; const played: string[] = [];
    h.client.attachBoard({ ...h.board, play: (step) => { played.push(step.kind); return new Promise<void>((r) => { release = r; }); } });
    h.sockets.last().receive(update(playingView(['a', 'b', 'c'], { revision: 21 }), [
      { type: 'DiceRolled', payload: { playerId: 'a', dice: [3, 4] } },
      { type: 'PlayerMoved', payload: { playerId: 'a', from: 0, steps: 7 } },
    ]));
    h.sockets.last().receive(update({ ...playingView(['a', 'b', 'c'], { revision: 22, owner: 'b' }), eliminated: ['a' as never], positions: { b: 0, c: 0 } }));
    expect(h.board.snaps.at(-1)?.positions).toEqual({ b: 0, c: 0 }); release(); await flushPromises();
    expect(played).toEqual(['dice']);
  });
});
