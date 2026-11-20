import { afterEach, describe, expect, it } from 'vitest';
import { createSession, gameEngine, projectState, type GameEvent, type StateView, type GameState } from '@game/game-core';
import { logEntries, seedRoom } from './helpers/db.js';
import { useHarness } from './helpers/harness.js';
import { lobby, nextMove, startGame, step, byPlayer, timeoutFor, whenIdle } from './helpers/game.js';
import { connect, expectStatus, http, login, startServer, stopServers, type TestGuest, type TestServer } from './helpers/server.js';
import { seededEntropy } from './helpers/seeded-entropy.js';

const h = useHarness({ perTest: true });
afterEach(stopServers);
const money = (v: StateView) => ({ board: v.board, economy: v.economy, balances: v.balances });

/** Only old protocol commands on sockets; pending auctions use system timers. */
function networkMove(state: GameState) {
  if (state.auction) return timeoutFor({ kind: 'auctionResponse', id: state.auction.responseId });
  if (state.purchase) return byPlayer('EndTurn', state.turn!.playerId, { kind: 'turn', id: state.turn!.turnId });
  return nextMove(state);
}

async function create(s: TestServer, guests: TestGuest[]) {
  const { room } = expectStatus(await http(s, 'POST', '/api/rooms', { token: guests[0]!.token }), 201);
  const id: string = room.roomId;
  for (const g of guests.slice(1)) expectStatus(await http(s, 'POST', `/api/rooms/${id}/join`, { token: g.token }), 200);
  return id;
}
const reward = (events: readonly GameEvent[]) => events.find(e => e.type === 'BalanceChanged' && (e.payload as { reason: string }).reason === 'lap-reward');

// spec: server/game-socket "Stage 2 state reaches every guest", "Start crossing", "Restart and reconnect"
describe('stage 2 network state', () => {
  it.each([2, 3])('%s guests see the same generated board and starting capital', async n => {
    let seed = 40;
    const server = await startServer(h, { gameSeed: () => seed++ });
    const guests = await Promise.all(Array.from({ length: n }, (_, i) => login(server, `guest ${i}`)));
    const id = await create(server, guests);
    const clients = await Promise.all(guests.map(g => connect(server, g, id)));
    for (const c of clients) expect(money(c.welcome.view)).toEqual(money(clients[0]!.welcome.view));
    expect(clients[0]!.welcome.view.board?.cells).toHaveLength(40);
    expectStatus(await http(server, 'POST', `/api/rooms/${id}/start`, { token: guests[0]!.token }), 200);
    const updates = await Promise.all(clients.map(c => c.socket.nextOf('Update')));
    const capital = n === 2 ? 29910 : 19940;
    for (const u of updates) {
      expect(money(u.view)).toEqual(money(updates[0]!.view));
      expect(u.view.balances).toEqual(Object.fromEntries(guests.map(g => [g.guestId, capital])));
      expect(u.events.filter(e => e.type === 'BalanceChanged')).toEqual(guests.map(g => ({ type: 'BalanceChanged', payload: { playerId: g.guestId, delta: capital, balance: capital, reason: 'starting-capital' } })));
    }
    const other = await create(server, guests);
    expect(server.manager.get(other)!.state.board?.cells).not.toEqual(updates[0]!.view.board?.cells);
    for (const gameId of [id, other]) expect((await logEntries(h.db, gameId))[0]!.events.some(e => e.type === 'BoardGenerated')).toBe(true);
  });

  it('broadcasts a seeded real crossing after persistence and reconnects all guests after restart', async () => {
    const server = await startServer(h, { gameSeed: () => 42 });
    const guests = await Promise.all(['a', 'b', 'c'].map(n => login(server, n)));
    const id = await create(server, guests);
    expectStatus(await http(server, 'POST', `/api/rooms/${id}/start`, { token: guests[0]!.token }), 200);
    const room = server.manager.get(id)!;
    // Search the deterministic command sequence using the actual seed, players and entropy.
    const session = createSession(gameEngine);
    const entropy = seededEntropy(1);
    for (const entry of await logEntries(h.db, id)) {
      expect(session.submit(entry.command, { now: entry.now, entropy: entropy.next() }).kind).toBe('accepted');
    }
    let count = 0;
    for (; count < 200; count++) {
      const command = networkMove(session.state);
      // Room timers draw command-id entropy before the transition's entropy.
      if (session.state.auction) entropy.next();
      const now = session.state.auction?.responseDeadline ?? session.log.at(-1)!.now;
      const result = session.submit(command, { now, entropy: entropy.next() });
      expect(result.kind).toBe('accepted');
      if (reward(result.events)) break;
    }
    expect(count).toBeLessThan(200);
    const clients = await Promise.all(guests.map(g => connect(server, g, id)));
    let last = clients[0]!.welcome.view;
    let crossing: GameEvent | undefined;
    const rollStream: Array<{ playerId: string; dice: number[]; types: string[] }> = [];
    const specialStream: GameEvent[] = [];
    for (let i = 0; i <= count; i++) {
      const command = networkMove(room.state);
      let actorIndex: number | undefined;
      if (room.state.auction) {
        server.clock.advance(room.state.auction.responseDeadline - server.clock.now());
        await whenIdle(room);
      } else {
        if (command.actor.kind !== 'player') throw new Error('expected player command');
        const actorId = command.actor.id;
        const index = guests.findIndex(g => g.guestId === actorId);
        actorIndex = index;
        clients[index]!.socket.send({ t: 'Command', commandId: `cross-${i}`, type: command.type, expected: command.expected, payload: null });
      }
      const updates = await Promise.all(clients.map(c => c.socket.nextOf('Update')));
      if (actorIndex !== undefined) expect(await clients[actorIndex]!.socket.nextOf('Ack')).toMatchObject({ outcome: 'accepted' });
      const persisted = (await logEntries(h.db, id)).at(-1)!;
      for (const u of updates) {
        expect(u.events).toEqual(persisted.events);
        expect(money(u.view)).toEqual(money(updates[0]!.view));
      }
      last = updates[0]!.view;
      crossing = reward(updates[0]!.events);
      const rolled = updates[0]!.events.find(e => e.type === 'DiceRolled');
      if (rolled) {
        const payload = rolled.payload as { playerId: string; dice: number[] };
        rollStream.push({ playerId: payload.playerId, dice: payload.dice, types: updates[0]!.events.map(e => e.type) });
      }
      specialStream.push(...updates[0]!.events.filter(e => [
        'ChanceDrawn', 'ChargeDue', 'ChargePaid', 'CasinoOffered', 'CasinoDeclined', 'BalanceChanged',
      ].includes(e.type)));
    }
    expect(crossing).toBeDefined();
    expect(rollStream.map(({ dice, types }) => ({ dice, types }))).toEqual([
      { dice: [3, 1], types: ['DiceRolled', 'PlayerMoved', 'ChanceDrawn', 'BalanceChanged'] },
      { dice: [5, 4], types: ['DiceRolled', 'PlayerMoved', 'PurchaseOffered'] },
      { dice: [3, 5], types: ['DiceRolled', 'PlayerMoved', 'PurchaseOffered'] },
      { dice: [1, 1], types: ['DiceRolled', 'PlayerMoved', 'PurchaseOffered'] },
      { dice: [6, 1], types: ['DiceRolled', 'PlayerMoved', 'PurchaseOffered'] },
      { dice: [1, 1], types: ['DiceRolled', 'PlayerMoved', 'PurchaseOffered'] },
      { dice: [4, 2], types: ['DiceRolled', 'PlayerMoved', 'ChanceDrawn', 'ChargeDue'] },
      { dice: [1, 5], types: ['DiceRolled', 'PlayerMoved', 'PurchaseOffered'] },
      { dice: [6, 1], types: ['DiceRolled', 'PlayerMoved', 'CasinoOffered'] },
      { dice: [6, 5], types: ['DiceRolled', 'PlayerMoved', 'PurchaseOffered'] },
      { dice: [5, 1], types: ['DiceRolled', 'PlayerMoved', 'CasinoOffered'] },
      { dice: [3, 2], types: ['DiceRolled', 'PlayerMoved', 'PurchaseOffered'] },
      { dice: [6, 4], types: ['DiceRolled', 'PlayerMoved', 'ChanceDrawn', 'ChargeDue'] },
      { dice: [4, 1], types: ['DiceRolled', 'PlayerMoved', 'PurchaseOffered'] },
      { dice: [3, 3], types: ['DiceRolled', 'PlayerMoved', 'PurchaseOffered'] },
      { dice: [6, 1], types: ['DiceRolled', 'PlayerMoved', 'ChanceDrawn', 'BalanceChanged'] },
      { dice: [4, 4], types: ['DiceRolled', 'PlayerMoved', 'BalanceChanged', 'PurchaseOffered'] },
    ]);
    const [firstPlayer, secondPlayer, thirdPlayer] = [rollStream[0]!.playerId, rollStream[1]!.playerId, rollStream[2]!.playerId];
    expect(rollStream.map(roll => roll.playerId)).toEqual([
      firstPlayer, secondPlayer, thirdPlayer, firstPlayer, firstPlayer, secondPlayer, secondPlayer,
      thirdPlayer, firstPlayer, secondPlayer, thirdPlayer, firstPlayer, secondPlayer, thirdPlayer,
      firstPlayer, firstPlayer, secondPlayer,
    ]);
    expect(specialStream).toEqual([
      { type: 'ChanceDrawn', payload: { playerId: firstPlayer, card: 'gain-5', amount: 990 } },
      { type: 'BalanceChanged', payload: { playerId: firstPlayer, delta: 990, balance: 20930, reason: 'chance' } },
      { type: 'ChanceDrawn', payload: { playerId: secondPlayer, card: 'loss-10', amount: 1990 } },
      { type: 'ChargeDue', payload: { payerId: secondPlayer, amount: 1990, cause: 'chance' } },
      { type: 'BalanceChanged', payload: { playerId: secondPlayer, delta: -1990, balance: 17950, reason: 'chance' } },
      { type: 'ChargePaid', payload: { payerId: secondPlayer, amount: 1990, auto: true } },
      { type: 'CasinoOffered', payload: { playerId: firstPlayer, cap: 1990 } },
      { type: 'CasinoDeclined', payload: { playerId: firstPlayer, auto: true } },
      { type: 'CasinoOffered', payload: { playerId: thirdPlayer, cap: 1990 } },
      { type: 'CasinoDeclined', payload: { playerId: thirdPlayer, auto: true } },
      { type: 'ChanceDrawn', payload: { playerId: secondPlayer, card: 'loss-5', amount: 990 } },
      { type: 'ChargeDue', payload: { payerId: secondPlayer, amount: 990, cause: 'chance' } },
      { type: 'BalanceChanged', payload: { playerId: secondPlayer, delta: -990, balance: 16960, reason: 'chance' } },
      { type: 'ChargePaid', payload: { payerId: secondPlayer, amount: 990, auto: true } },
      { type: 'ChanceDrawn', payload: { playerId: firstPlayer, card: 'gain-5', amount: 990 } },
      { type: 'BalanceChanged', payload: { playerId: firstPlayer, delta: 990, balance: 21920, reason: 'chance' } },
      { type: 'BalanceChanged', payload: { playerId: secondPlayer, delta: 2650, balance: 19610, reason: 'lap-reward' } },
    ]);
    const payload = crossing!.payload as { playerId: string; delta: number; balance: number };
    expect(payload.delta).toBe(2650);
    expect(payload.playerId).toBe(secondPlayer);
    // The crossing player drew loss-10 and loss-5; the two gain-5 cards went to firstPlayer.
    expect(payload.balance).toBe(19940 - 1990 - 990 + 2650);
    expect(last.balances[payload.playerId]).toBe(payload.balance);
    const revision = last.revision;
    await server.stop();
    const restarted = await startServer(h, { restore: true });
    for (const guest of guests) {
      const { welcome } = await connect(restarted, guest, id, revision);
      expect(welcome.revision).toBe(revision);
      expect(money(welcome.view)).toEqual(money(last));
    }
  });
});

// spec: server/recovery "Stage 2 recovery equality"
it('restores board and balances from a crash-style snapshot plus a tail containing a crossing', async () => {
  const first = h.manager();
  const id = await seedRoom(h.db);
  const live = await first.manager.open(id);
  await lobby(live, ['a', 'b', 'c'], 42);
  await startGame(live); // snapshot at revision 5
  let crossed = false;
  for (let i = 0; i < 200; i++) {
    if (reward((await step(live)).events)) { crossed = true; break; }
  }
  expect(crossed).toBe(true);
  const loaded = await first.store.loadGame(id);
  expect(loaded.snapshot).not.toBeNull();
  expect(loaded.tail.length).toBeGreaterThan(0);
  expect(loaded.tail.some(e => reward(e.events))).toBe(true);
  const second = h.manager({ seed: 2 }); // first manager never shut down before restore
  expect(await second.manager.restoreAll()).toEqual({ restored: [id], failed: [] });
  const restored = second.manager.get(id)!;
  expect(money(projectState(restored.state, { kind: 'spectator' }))).toEqual(money(projectState(live.state, { kind: 'spectator' })));
  expect(restored.state).toEqual(live.state);
});
