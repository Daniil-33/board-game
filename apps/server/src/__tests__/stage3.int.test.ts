import { afterEach, describe, expect, it } from 'vitest';
import { pendingDeadlines, projectState, type GameCommand } from '@game/game-core';
import { PROTOCOL_VERSION, decodeServerFrame } from '@game/protocol';
import { logEntries } from './helpers/db.js';
import { cid, nextMove, whenIdle } from './helpers/game.js';
import { useHarness } from './helpers/harness.js';
import { connect, expectStatus, http, login, startServer, stopServers, TestSocket } from './helpers/server.js';

const h = useHarness({ perTest: true });
afterEach(stopServers);

async function game() {
  const server = await startServer(h, { gameSeed: () => 42 });
  const guests = await Promise.all(['a', 'b', 'c'].map(n => login(server, n)));
  const { room: { roomId: id } } = expectStatus(await http(server, 'POST', '/api/rooms', { token: guests[0]!.token }), 201);
  for (const guest of guests.slice(1)) expectStatus(await http(server, 'POST', `/api/rooms/${id}/join`, { token: guest.token }), 200);
  expectStatus(await http(server, 'POST', `/api/rooms/${id}/start`, { token: guests[0]!.token }), 200);
  const clients = await Promise.all(guests.map(g => connect(server, g, id)));
  const room = server.manager.get(id)!;
  const index = (actor: string) => guests.findIndex(g => g.guestId === actor);
  async function updates() {
    const frames = await Promise.all(clients.map(c => c.socket.nextOf('Update')));
    const persisted = (await logEntries(h.db, id)).at(-1)!;
    for (const [i, frame] of frames.entries()) {
      expect(frame.revision).toBe(persisted.revision);
      expect(frame.events).toEqual(persisted.events);
      expect(frame.view).toEqual(projectState(room.state, { kind: 'player', id: guests[i]!.guestId as never }));
      expect(Object.keys(frame).sort()).toEqual(['events', 'revision', 't', 'view']);
      expect(decodeServerFrame(JSON.stringify(frame))).toEqual({ ok: true, frame });
    }
    expect(server.clock.pending).toEqual(pendingDeadlines(room.state).map(d => d.at));
    return frames[0]!;
  }
  async function send(command: GameCommand) {
    if (command.actor.kind !== 'player') throw new Error('player required');
    const socket = clients[index(command.actor.id)]!.socket;
    const frame = { t: 'Command', commandId: command.commandId, type: command.type, expected: command.expected, payload: null };
    socket.send(frame);
    const update = await updates();
    const ack = await socket.nextOf('Ack');
    expect(ack).toEqual({ t: 'Ack', commandId: command.commandId, outcome: 'accepted', revision: update.revision });
    return { frame, socket, ack, update };
  }
  async function intent(type: string) {
    const s = room.state;
    const actor = s.auction?.responder ?? s.turn!.playerId;
    const target = s.auction ? { kind: 'auctionResponse', id: s.auction.responseId } : { kind: 'turn', id: s.turn!.turnId };
    return send({ type, commandId: cid(type), actor: { kind: 'player', id: actor }, expected: { kind: 'target', target }, payload: null });
  }
  for (let i = 0; i < 100 && !room.state.purchase; i++) await send(nextMove(room.state));
  expect(room.state.purchase).not.toBeNull();
  return { server, guests, clients, room, id, updates, send, intent };
}

// spec: server/game-socket "Auction responder commands", server/timers "Auction timers follow state"
describe('stage 3 auction sockets', () => {
  it('persists and broadcasts three-guest bid/outbid/pass/AFK win, rejects stale slots and returns the original duplicate Ack', async () => {
    const g = await game();
    const { room, server, id } = g;
    const owner = room.state.turn!.playerId;
    const asset = room.state.purchase!.assetId;
    server.clock.advance(1234);
    const remaining = room.state.turn!.deadline - server.clock.now();
    await g.intent('StartAuction');
    expect(room.state.turn!.pausedRemainingMs).toBe(remaining);
    await g.intent('Bid');
    expect(room.state.auction!.responder).not.toBe(owner);
    const bid = await g.intent('Bid');
    const winner = room.state.auction!.leader!;
    const amount = room.state.auction!.leadingBid!;
    const balance = room.state.balances[winner]!;
    const state = room.state;
    const log = await logEntries(h.db, id);
    const counts = g.clients.map(c => c.socket.frames.filter(f => f.t === 'Update').length);
    bid.socket.send(bid.frame);
    expect(await bid.socket.nextOf('Ack')).toEqual(bid.ack);
    bid.socket.send({ ...bid.frame, commandId: cid('stale') });
    expect(await bid.socket.nextOf('Ack')).toMatchObject({ outcome: 'rejected', error: { code: 'TARGET_MISMATCH' } });
    expect(room.state).toBe(state);
    expect(await logEntries(h.db, id)).toEqual(log);
    expect(g.clients.map(c => c.socket.frames.filter(f => f.t === 'Update').length)).toEqual(counts);
    await g.intent('PassAuction');
    const response = room.state.auction!;
    expect(server.clock.pending).toEqual([server.clock.now() + 10_000]);
    const revision = room.state.revision;
    server.clock.advance(9999);
    await whenIdle(room);
    expect(room.state.revision).toBe(revision);
    server.clock.advance(1);
    await whenIdle(room);
    const final = await g.updates();
    expect(final.events).toContainEqual({ type: 'AuctionPassed', payload: { auctionId: response.auctionId, playerId: response.responder, auto: true } });
    expect(final.events.some(e => e.type === 'AuctionWon')).toBe(true);
    expect(room.state.auction).toBeNull();
    expect(room.state.owners[asset]).toBe(winner);
    expect(room.state.balances[winner]).toBe(balance - amount);
    expect(room.state.turn!.playerId).toBe(owner);
    expect(room.state.turn!.deadline).toBe(server.clock.now() + remaining);
    expect(room.state.turn!.pausedRemainingMs).toBeNull();
    expect((await logEntries(h.db, id)).at(-1)!.command).toMatchObject({ type: 'Timeout', actor: { kind: 'system' }, expected: { kind: 'target', target: { kind: 'auctionResponse', id: response.responseId } } });
  });

  it.each(['StartAuction', 'EndTurn', 'Timeout'])('%s settles an unsold auction and resumes or closes the turn from state', async trigger => {
    const g = await game();
    const asset = g.room.state.purchase!.assetId;
    const turn = g.room.state.turn!;
    if (trigger === 'Timeout') {
      g.server.clock.advance(turn.deadline - g.server.clock.now());
      await whenIdle(g.room);
      await g.updates();
    } else await g.intent(trigger);
    expect(g.room.state.auction!.reason).toBe(trigger === 'StartAuction' ? 'choice' : trigger === 'EndTurn' ? 'end-turn' : 'timeout');
    for (let i = 0; i < 2; i++) await g.intent('PassAuction');
    g.server.clock.advance(10_000);
    await whenIdle(g.room);
    const final = await g.updates();
    expect(final.events.some(e => e.type === 'AuctionEndedUnsold')).toBe(true);
    expect(g.room.state.owners[asset]).toBeUndefined();
    expect(g.room.state.auction).toBeNull();
    if (trigger === 'StartAuction') expect(g.room.state.turn!.turnId).toBe(turn.turnId);
    else expect(g.room.state.turn!.turnId).not.toBe(turn.turnId);
  });

  it('buys a free asset over the socket', async () => {
    const g = await game();
    const purchase = g.room.state.purchase!;
    const before = g.room.state.balances[purchase.playerId]!;
    const { update } = await g.intent('BuyAsset');
    expect(g.room.state.owners[purchase.assetId]).toBe(purchase.playerId);
    expect(g.room.state.balances[purchase.playerId]).toBeLessThan(before);
    expect(update.events.some(e => e.type === 'AssetPurchased')).toBe(true);
  });

  it('rejects a v2 Hello before authentication', async () => {
    const server = await startServer(h);
    const socket = await TestSocket.open(server.wsUrl);
    socket.send({ t: 'Hello', protocolVersion: 2, token: 'invalid', gameId: 'unknown', lastRevision: null });
    expect(PROTOCOL_VERSION).toBe(4);
    expect(await socket.nextOf('Error')).toMatchObject({ code: 'PROTOCOL_VERSION_UNSUPPORTED' });
    await socket.whenClosed();
  });

  it.each(['decision', 'auction'])('clean restart and all three reconnects preserve full %s state and projections', async phase => {
    const g = await game();
    let accepted;
    if (phase === 'auction') {
      await g.intent('StartAuction');
      accepted = await g.intent('Bid');
    }
    const before = g.room.state;
    const views = g.guests.map(guest => projectState(before, { kind: 'player', id: guest.guestId as never }));
    await g.server.stop();
    const restored = await startServer(h, { restore: true });
    expect(restored.manager.get(g.id)!.state).toEqual(before);
    expect(restored.clock.pending).toEqual(pendingDeadlines(before).map(d => d.at));
    const clients = await Promise.all(g.guests.map(guest => connect(restored, guest, g.id, before.revision)));
    for (const [i, client] of clients.entries()) expect(client.welcome.view).toEqual(views[i]);
    if (accepted) {
      const actor = (await logEntries(h.db, g.id)).find(e => e.command.commandId === accepted.frame.commandId)!.command.actor;
      if (actor.kind !== 'player') throw new Error('player required');
      const socket = clients[g.guests.findIndex(guest => guest.guestId === actor.id)]!.socket;
      socket.send(accepted.frame);
      expect(await socket.nextOf('Ack')).toEqual(accepted.ack);
      expect(restored.manager.get(g.id)!.state).toEqual(before);
      expect((await logEntries(h.db, g.id)).at(-1)!.revision).toBe(before.revision);
    }
  });
});
