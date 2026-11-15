import { afterEach, describe, expect, it } from 'vitest';
import { TURN_DURATION_MS, type GameState } from '@game/game-core';
import type { UpdateFrame } from '@game/protocol';
import { roomStatus, snapshotRevisions } from './helpers/db.js';
import { nextMove } from './helpers/game.js';
import { useHarness } from './helpers/harness.js';
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

const h = useHarness();
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
  const command = nextMove(stateOf(s, roomId));
  const mover = players.find((p) => command.actor.kind === 'player' && p.guest.guestId === command.actor.id)!;
  const commandId = `m-${++seq}`;
  mover.socket.send({ t: 'Command', commandId, type: command.type, expected: command.expected, payload: null });
  const ack = await mover.socket.next((f) => f.t === 'Ack' && f.commandId === commandId);
  expect(ack).toMatchObject({ outcome: 'accepted' });
  return ack;
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

  it('Server restart: both players reconnect, Welcome at the persisted revision, play continues', async () => {
    const s = await startServer(h);
    const { roomId, players } = await newGame(s, ['Alice', 'Bob']);
    while (stateOf(s, roomId).phase === 'setup') await move(s, roomId, players);
    for (let i = 0; i < 3; i++) await move(s, roomId, players);
    const revision = stateOf(s, roomId).revision;
    await everyoneAt(players, revision);

    await s.stop();
    for (const p of players) await p.socket.whenClosed();

    const s2 = await startServer(h, { restore: true });
    expect(s2.manager.get(roomId)).toBeDefined();
    for (const p of players) {
      const { socket, welcome } = await connect(s2, p.guest, roomId, revision);
      expect(welcome.revision).toBe(revision);
      p.socket = socket;
    }
    for (let i = 0; i < 4; i++) await move(s2, roomId, players);
    await everyoneAt(players, revision + 4);
  });
});

async function waitFor(condition: () => boolean, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('condition not met in time');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
