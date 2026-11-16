import { afterEach, describe, expect, it } from 'vitest';
import { TURN_DURATION_MS, type GameCommand, type GameState } from '@game/game-core';
import type { UpdateFrame } from '@game/protocol';
import { entropyHex } from '../context/entropy.js';
import { RETRY_FLOOR_MS } from '../rooms/room.js';
import { logEntries, roomStatus, snapshotRevisions } from './helpers/db.js';
import { nextMove, byPlayer, whenIdle } from './helpers/game.js';
import { useHarness } from './helpers/harness.js';
import { seededEntropy } from './helpers/seeded-entropy.js';
import {
  connect,
  expectStatus,
  http,
  login,
  startServer,
  stopServers,
  type TestGuest,
  type TestServer,
  type TestSocket,
} from './helpers/server.js';

// One database per test: a restart restores only the test's own room.
const h = useHarness({ perTest: true });
afterEach(stopServers);

interface Player {
  readonly guest: TestGuest;
  socket: TestSocket;
}

let seq = 0;

/** Lobby over HTTP (create, join), every player connected, then start: the full client path. */
async function newGame(s: TestServer, names: string[]): Promise<{ roomId: string; players: Player[] }> {
  const guests = await Promise.all(names.map((n) => login(s, n)));
  const roomId: string = expectStatus(await http(s, 'POST', '/api/rooms', { token: guests[0]!.token }), 201).room.roomId;
  const players: Player[] = [];
  for (const guest of guests) {
    if (guest !== guests[0]) expectStatus(await http(s, 'POST', `/api/rooms/${roomId}/join`, { token: guest.token }), 200);
    players.push({ guest, socket: (await connect(s, guest, roomId)).socket });
  }
  expectStatus(await http(s, 'POST', `/api/rooms/${roomId}/start`, { token: guests[0]!.token }), 200);
  return { roomId, players };
}

const stateOf = (s: TestServer, roomId: string): GameState => s.manager.get(roomId)!.state;

/** The player to move sends the next move over their socket; resolves with its Ack. */
async function move(s: TestServer, roomId: string, players: Player[]) {
  const room = s.manager.get(roomId)!;
  const state = room.state;
  if (state.auction) {
    const before = state.revision;
    s.clock.advance(state.auction.responseDeadline - s.clock.now());
    await whenIdle(room);
    expect(room.state.revision).toBe(before + 1);
    await everyoneAt(players, room.state.revision);
    return;
  }
  const command = state.purchase
    ? byPlayer('EndTurn', state.turn!.playerId, { kind: 'turn', id: state.turn!.turnId })
    : nextMove(state);
  return send(players, command);
}

/** Every player received an Update at `revision` or later. */
async function everyoneAt(players: Player[], revision: number): Promise<void> {
  for (const p of players) await p.socket.seen((f) => (f.t === 'Update' || f.t === 'Welcome') && f.revision >= revision);
}

function resign(s: TestServer, roomId: string, player: Player, commandId: string) {
  player.socket.send({
    t: 'Command',
    commandId,
    type: 'Resign',
    expected: { kind: 'revision', revision: stateOf(s, roomId).revision },
    payload: null,
  });
  return player.socket.next((f) => f.t === 'Ack' && f.commandId === commandId);
}

// handoff criterion 11; spec: server/game-socket
describe('end to end', () => {
  it('two guests: lobby, start, setup and turns; every Update reaches both', async () => {
    const s = await startServer(h);
    const { roomId, players } = await newGame(s, ['Alice', 'Bob']);
    while (stateOf(s, roomId).phase === 'setup') await move(s, roomId, players);
    expect(stateOf(s, roomId).phase).toBe('playing');
    for (let i = 0; i < 8; i++) await move(s, roomId, players);
    const revision = stateOf(s, roomId).revision;
    await everyoneAt(players, revision);
    // Revision order, no gaps, no duplicates on each socket.
    for (const p of players) {
      const revisions = p.socket.frames.filter((f): f is UpdateFrame => f.t === 'Update').map((f) => f.revision);
      expect(revisions).toEqual([...revisions].sort((a, b) => a - b));
      expect(new Set(revisions).size).toBe(revisions.length);
      expect(revisions.at(-1)).toBe(revision);
    }
  });

  it('three guests with deadlines: a turn timeout reaches everyone as an Update', async () => {
    const s = await startServer(h);
    const { roomId, players } = await newGame(s, ['A', 'B', 'C']);
    while (stateOf(s, roomId).phase === 'setup') await move(s, roomId, players);
    const turn = stateOf(s, roomId).turn!;
    const before = stateOf(s, roomId).revision;
    s.clock.advance(TURN_DURATION_MS);
    await waitFor(() => stateOf(s, roomId).turn?.turnId !== turn.turnId || stateOf(s, roomId).revision > before);
    const revision = stateOf(s, roomId).revision;
    for (const p of players) {
      const update = await p.socket.seen((f) => f.t === 'Update' && f.revision === revision);
      expect((update as UpdateFrame).events.some((e) => e.type === 'TurnEnded' || e.type === 'TurnContinued' || e.type === 'DiceRolled')).toBe(true);
    }
  });

  it('Resign down to a winner: own turn, then another\'s turn; finished, GameEnded to all, Hello still works', async () => {
    const s = await startServer(h);
    const { roomId, players } = await newGame(s, ['A', 'B', 'C']);
    while (stateOf(s, roomId).phase === 'setup') await move(s, roomId, players);

    const onTurn = players.find((p) => p.guest.guestId === stateOf(s, roomId).turn!.playerId)!;
    expect(await resign(s, roomId, onTurn, 'resign-own')).toMatchObject({ outcome: 'accepted' });
    expect(stateOf(s, roomId).phase).toBe('playing');

    const notOnTurn = players.find((p) => p !== onTurn && p.guest.guestId !== stateOf(s, roomId).turn!.playerId)!;
    expect(await resign(s, roomId, notOnTurn, 'resign-other')).toMatchObject({ outcome: 'accepted' });

    const winner = players.find((p) => p !== onTurn && p !== notOnTurn)!;
    const state = stateOf(s, roomId);
    expect(state.phase).toBe('finished');
    expect(state.winner).toBe(winner.guest.guestId);
    expect(await roomStatus(h.db, roomId)).toBe('finished');
    expect(await snapshotRevisions(h.db, roomId)).toContain(state.revision);
    for (const p of players) {
      const last = (await p.socket.seen((f) => f.t === 'Update' && f.revision === state.revision)) as UpdateFrame;
      expect(last.events.at(-1)).toEqual({ type: 'GameEnded', payload: { winner: winner.guest.guestId } });
    }
    // A resigned player is not resigned by its socket closing, and may still watch.
    onTurn.socket.close();
    const { welcome } = await connect(s, onTurn.guest, roomId);
    expect(welcome.view).toMatchObject({ phase: 'finished', winner: winner.guest.guestId });
    // Further commands are rejected by the core.
    expect(await resign(s, roomId, winner, 'resign-late')).toMatchObject({ outcome: 'rejected' });

    // Finished room after a restart.
    await s.stop();
    const s2 = await startServer(h, { restore: true });
    const after = await connect(s2, notOnTurn.guest, roomId);
    expect(after.welcome).toMatchObject({ revision: state.revision, view: { phase: 'finished', winner: winner.guest.guestId } });
    const listed = expectStatus(await http(s2, 'GET', '/api/rooms', { token: notOnTurn.guest.token }), 200);
    expect(listed.rooms.find((r: { roomId: string }) => r.roomId === roomId)).toMatchObject({ status: 'finished' });
  });

  it('Server restart without an auction: both players reconnect, Welcome at the persisted revision, play continues', async () => {
    const s = await startServer(h, { gameSeed: () => 42 });
    const { roomId, players } = await newGame(s, ['Alice', 'Bob']);
    while (stateOf(s, roomId).phase === 'setup') await move(s, roomId, players);
    for (let i = 0; i < 3; i++) await buyOrMove(s, roomId, players);
    const revision = stateOf(s, roomId).revision;
    await everyoneAt(players, revision);

    const s2 = await restart(s, players, roomId, revision);
    for (let i = 0; i < 4; i++) await buyOrMove(s2, roomId, players);
    await everyoneAt(players, revision + 4);
    expect((await logEntries(h.db, roomId)).some((e) => e.events.some((ev) => ev.type === 'AuctionStarted'))).toBe(false);
    expect(s2.logger.lines.filter((l) => l.level !== 'info')).toEqual([]);
  });

  it('Server restart with a purchase decision: an auction opened on the restored server times out on its fake clock', async () => {
    const { s2, roomId, players } = await auctionAfterRestart();
    const room = s2.manager.get(roomId)!;
    const auction = room.state.auction!;
    const before = room.state.revision;

    s2.clock.advance(auction.responseDeadline - s2.clock.now());
    await whenIdle(room);
    expect(room.state.revision).toBe(before + 1);
    const entry = (await logEntries(h.db, roomId)).at(-1)!;
    expect(entry.command).toMatchObject({ type: 'Timeout', expected: { kind: 'target', target: { kind: 'auctionResponse', id: auction.responseId } } });
    expect(entry.now).toBe(auction.responseDeadline);
    const passed = { type: 'AuctionPassed', payload: { auctionId: auction.auctionId, playerId: auction.responder, auto: true } };
    expect(entry.events[0]).toEqual(passed);
    for (const p of players) {
      const update = (await p.socket.seen((f) => f.t === 'Update' && f.revision === before + 1)) as UpdateFrame;
      expect(update.events[0]).toEqual(passed);
    }
    expect(s2.logger.lines.filter((l) => l.level !== 'info')).toEqual([]);
    const timeoutIds = (await logEntries(h.db, roomId)).filter((e) => e.command.type === 'Timeout').map((e) => e.command.commandId);
    expect(timeoutIds.length).toBeGreaterThanOrEqual(2);
    expect(new Set(timeoutIds).size).toBe(timeoutIds.length);
  });

  // Regression guard for the flaky restart test: a restored server that reuses the first
  // server's entropy seed repeats a Timeout id already in the log. The core rejects it and
  // the room retries RETRY_FLOOR_MS later, after the deadline the test asserted on.
  it('a restored server reusing the entropy seed repeats a logged Timeout id: COMMAND_ID_CONFLICT, then the retry resolves it', async () => {
    const { s2, roomId, priorTimeoutIndex } = await auctionAfterRestart({ collide: true });
    const room = s2.manager.get(roomId)!;
    const auction = room.state.auction!;
    const before = room.state.revision;
    expect(priorTimeoutIndex).toBeGreaterThan(0);

    s2.clock.advance(auction.responseDeadline - s2.clock.now());
    await whenIdle(room);
    expect(room.state.revision).toBe(before);
    expect(s2.logger.lines).toContainEqual({
      level: 'warn',
      message: 'Timeout did not resolve its deadline; retrying',
      fields: { gameId: roomId, target: { kind: 'auctionResponse', id: auction.responseId }, code: 'COMMAND_ID_CONFLICT' },
    });
    expect(s2.clock.pending).toContain(s2.clock.now() + RETRY_FLOOR_MS);

    s2.clock.advance(RETRY_FLOOR_MS);
    await whenIdle(room);
    expect(room.state.revision).toBe(before + 1);
  });
});

/** Like `move`, but a pending purchase is bought, so no auction ever opens. */
async function buyOrMove(s: TestServer, roomId: string, players: Player[]) {
  const state = stateOf(s, roomId);
  expect(state.auction).toBeNull();
  if (!state.purchase) return move(s, roomId, players);
  return send(players, byPlayer('BuyAsset', state.turn!.playerId, { kind: 'turn', id: state.turn!.turnId }));
}

/** The command's actor sends it over their socket; resolves with its accepted Ack. */
async function send(players: Player[], command: GameCommand) {
  const mover = players.find((p) => command.actor.kind === 'player' && p.guest.guestId === command.actor.id)!;
  const commandId = `m-${++seq}`;
  mover.socket.send({ t: 'Command', commandId, type: command.type, expected: command.expected, payload: null });
  const ack = await mover.socket.next((f) => f.t === 'Ack' && f.commandId === commandId);
  expect(ack).toMatchObject({ outcome: 'accepted' });
  return ack;
}

/** Stop `s`, start a restored server at the same time, reconnect everyone at `revision`. */
async function restart(s: TestServer, players: Player[], roomId: string, revision: number, options: { seed?: number } = {}) {
  const now = s.clock.now();
  await s.stop();
  for (const p of players) await p.socket.whenClosed();
  const s2 = await startServer(h, { restore: true, now, ...options });
  expect(s2.manager.get(roomId)).toBeDefined();
  for (const p of players) {
    const { socket, welcome } = await connect(s2, p.guest, roomId, revision);
    expect(welcome.revision).toBe(revision);
    p.socket = socket;
  }
  return s2;
}

/**
 * First server: play until an auction response has timed out (a Timeout id in
 * the log) and a later purchase decision is pending. Restart, then StartAuction
 * on the restored server. `collide` restarts with the first server's seed 1 and
 * skips draws so that its next Timeout id is the one already logged.
 */
async function auctionAfterRestart(options: { collide?: boolean } = {}) {
  const s = await startServer(h, { gameSeed: () => 42 });
  const { roomId, players } = await newGame(s, ['Alice', 'Bob']);
  let timedOut = false;
  for (let i = 0; i < 200 && !(timedOut && stateOf(s, roomId).purchase); i++) {
    const state = stateOf(s, roomId);
    if (state.auction) timedOut = true;
    if (state.purchase && !timedOut) await send(players, nextMove(state)); // StartAuction
    else await move(s, roomId, players);
  }
  const decision = stateOf(s, roomId);
  expect(timedOut).toBe(true);
  expect(decision.purchase).not.toBeNull();
  expect(decision.auction).toBeNull();
  const prior = (await logEntries(h.db, roomId)).filter((e) => e.command.type === 'Timeout').map((e) => e.command.commandId as string);
  expect(prior.length).toBeGreaterThan(0);
  await everyoneAt(players, decision.revision);

  let priorTimeoutIndex = -1;
  if (options.collide) {
    const stream = seededEntropy(1);
    for (let i = 0; i < 10_000 && priorTimeoutIndex < 0; i++) {
      if (prior.includes(`timeout-${entropyHex(stream.next())}`)) priorTimeoutIndex = i;
    }
  }
  const s2 = await restart(s, players, roomId, decision.revision, options.collide ? { seed: 1 } : {});
  // StartAuction draws one value, then the timer draws the Timeout id.
  for (let i = 0; i < priorTimeoutIndex - 1; i++) s2.entropy.next();
  await send(players, nextMove(stateOf(s2, roomId)));
  expect(stateOf(s2, roomId).auction).not.toBeNull();
  return { s2, roomId, players, priorTimeoutIndex };
}

async function waitFor(condition: () => boolean, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('condition not met in time');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
