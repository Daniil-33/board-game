// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { Value } from '@sinclair/typebox/value';
import { houseCost, houseRefund, type AssetId, type GameEvent, type StateView } from '@game/game-core';
import { PROTOCOL_VERSION, GuestLoginResponseSchema, decodeServerFrame, type AckFrame, type ClientFrame, type ServerFrame } from '@game/protocol';
import { stepsForEvents } from '../../src/entities/game/index';
import { MockServer } from '../server';
import { BOT_DELAY_MS, LOBBY_BOT_DELAY_MS } from '../script';

function fakeTimers() {
  let now = 1_000_000; let next = 1;
  const timers = new Map<number, { at: number; callback: () => void }>();
  return {
    now: () => now,
    setTimeout: (callback: () => void, ms: number) => { timers.set(next, { at: now + ms, callback }); return next++; },
    clearTimeout: (handle: unknown) => void timers.delete(handle as number),
    advance(ms: number): void {
      const end = now + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (due === undefined) break;
        timers.delete(due[0]); now = Math.max(now, due[1].at); due[1].callback();
      }
      now = end;
    },
  };
}

/** The stage 4 scenario through the mock socket; every frame is decoded with the protocol decoders. */
function stage4() {
  const timers = fakeTimers();
  const mock = new MockServer({ turnMs: 45_000, continuationMs: 20_000, timers, scenario: 'stage4' });
  const login = mock.http('POST', '/api/guests', undefined, { nickname: 'Alice' });
  if (!Value.Check(GuestLoginResponseSchema, login.body)) throw new Error('bad login');
  const { guestId, token } = login.body;
  const auth = `Bearer ${token}`;
  const frames: ServerFrame[] = [];
  const peer = {
    send(frame: ServerFrame) {
      const decoded = decodeServerFrame(JSON.stringify(frame));
      if (!decoded.ok) throw new Error(decoded.error.message);
      frames.push(decoded.frame);
    },
    close() {},
  };
  const { room } = mock.http('POST', '/api/rooms', auth, undefined).body as { room: { roomId: string } };
  const say = (frame: ClientFrame): void => mock.message(peer, JSON.stringify(frame));
  say({ t: 'Hello', protocolVersion: PROTOCOL_VERSION, token, gameId: room.roomId, lastRevision: null });
  timers.advance(LOBBY_BOT_DELAY_MS);
  mock.http('POST', `/api/rooms/${room.roomId}/start`, auth, undefined);
  const view = (): StateView => {
    const last = [...frames].reverse().find((f) => f.t === 'Welcome' || f.t === 'Update');
    if (last === undefined || (last.t !== 'Welcome' && last.t !== 'Update')) throw new Error('no view');
    return last.view;
  };
  let n = 1;
  const send = (frame: Omit<Extract<ClientFrame, { t: 'Command' }>, 't' | 'commandId' | 'expected'>): AckFrame => {
    const v = view();
    const expected = v.setup ? { kind: 'target' as const, target: { kind: 'setupRoll', id: v.setup.setupRollId } } : { kind: 'target' as const, target: { kind: 'turn', id: v.turn!.turnId } };
    const commandId = `c${n++}` as never;
    say({ t: 'Command', commandId, expected, ...frame } as ClientFrame);
    return frames.find((f): f is AckFrame => f.t === 'Ack' && f.commandId === commandId)!;
  };
  const eventsSince = (count: number): GameEvent[] => frames.slice(count).flatMap((f) => (f.t === 'Update' ? f.events : []));
  const assetAt = (index: number): AssetId => view().board!.cells[index]!.asset!.assetId;
  return { timers, frames, guestId, view, send, eventsSince, assetAt };
}

describe('mock stage 4 scenario', () => {
  it('scripts rent payment, an illegal build, build, sell and the automatic payment at the end of a turn', () => {
    const g = stage4();
    while (g.view().setup) {
      if (g.view().setup!.playerId === g.guestId) expect(g.send({ type: 'RollForOrder', payload: null }).outcome).toBe('accepted');
      else g.timers.advance(BOT_DELAY_MS);
    }
    expect(g.view().turn!.playerId).toBe(g.guestId);
    const bot = g.view().order!.find((id) => id !== g.guestId)!;
    // Seeded: the human owns M1 and M2 (houses 1, 1, 0) and an energy asset; the bot owns two logistics.
    expect(g.view().owners[g.assetAt(5)]).toBe(bot);
    expect(g.view().rentQuotes[g.assetAt(12)]).toMatchObject({ kind: 'energy', holdings: 1, groupSize: 2 });

    // 1. The human lands on the bot's logistics and pays rent explicitly.
    expect(g.send({ type: 'RollDice', payload: null }).outcome).toBe('accepted');
    const due = g.view().rent!;
    expect(due).toMatchObject({ payerId: g.guestId, ownerId: bot, assetId: g.assetAt(5), kind: 'logistics', diceSum: null });
    const rentPending = g.send({ type: 'BuildHouse', payload: { assetId: g.assetAt(9) } });
    expect(rentPending).toMatchObject({ outcome: 'rejected', error: { code: 'RENT_PENDING' } });
    const before = g.view().balances;
    let mark = g.frames.length;
    expect(g.send({ type: 'PayRent', payload: null }).outcome).toBe('accepted');
    expect(g.view().rent).toBeNull();
    expect(g.view().balances[g.guestId]).toBe(before[g.guestId]! - due.amount);
    expect(g.view().balances[bot]).toBe(before[bot]! + due.amount);
    const paid = g.eventsSince(mark);
    expect(paid.find((e) => e.type === 'RentPaid')!.payload).toMatchObject({ amount: due.amount, auto: false });
    expect(stepsForEvents(paid, 40)).toEqual([{ kind: 'rentPayment', from: g.guestId, to: bot, amount: due.amount }]);

    // 2. An illegal (uneven) build is rejected; a legal build and a sale are accepted.
    expect(g.send({ type: 'BuildHouse', payload: { assetId: g.assetAt(6) } })).toMatchObject({ outcome: 'rejected', error: { code: 'UNEVEN_BUILD' } });
    const price = g.view().board!.cells[9]!.asset!.price;
    const balance = g.view().balances[g.guestId]!;
    mark = g.frames.length;
    expect(g.send({ type: 'BuildHouse', payload: { assetId: g.assetAt(9) } }).outcome).toBe('accepted');
    expect(g.view().houses[g.assetAt(9)]).toBe(1);
    expect(g.view().turn!.quotas.builds).toBe(0);
    expect(g.view().balances[g.guestId]).toBe(balance - houseCost(price));
    expect(g.eventsSince(mark).find((e) => e.type === 'HouseBuilt')!.payload).toMatchObject({ cost: houseCost(price) });
    expect(g.send({ type: 'BuildHouse', payload: { assetId: g.assetAt(6) } })).toMatchObject({ outcome: 'rejected', error: { code: 'BUILD_QUOTA_USED' } });
    mark = g.frames.length;
    expect(g.send({ type: 'SellHouse', payload: { assetId: g.assetAt(9) } }).outcome).toBe('accepted');
    expect(g.view().houses[g.assetAt(9)]).toBeUndefined();
    expect(g.eventsSince(mark).find((e) => e.type === 'HouseSold')!.payload).toMatchObject({ refund: houseRefund(houseCost(price)) });
    expect(g.send({ type: 'EndTurn', payload: null }).outcome).toBe('accepted');

    // 3. The bot lands on the human's complete M1 group and ends its turn: the rent is paid automatically.
    mark = g.frames.length;
    g.timers.advance(BOT_DELAY_MS);
    const botDue = g.view().rent!;
    expect(botDue).toMatchObject({ payerId: bot, ownerId: g.guestId, assetId: g.assetAt(3), kind: 'regular' });
    expect(botDue.amount).toBe(g.view().rentQuotes[g.assetAt(3)]!.kind === 'fixed' ? (g.view().rentQuotes[g.assetAt(3)] as { amount: number }).amount : -1);
    g.timers.advance(BOT_DELAY_MS);
    const auto = g.eventsSince(mark);
    expect(auto.map((e) => e.type)).toEqual(expect.arrayContaining(['RentDue', 'RentPaid', 'TurnEnded', 'TurnStarted']));
    expect(auto.find((e) => e.type === 'RentPaid')!.payload).toMatchObject({ payerId: bot, ownerId: g.guestId, amount: botDue.amount, auto: true });
    expect(g.view().rent).toBeNull();
    expect(g.view().turn!.playerId).toBe(g.guestId);

    // 4. The human lands on the bot's M3 asset; the bot then lands on the human's energy asset with dice sum 9.
    expect(g.send({ type: 'RollDice', payload: null }).outcome).toBe('accepted');
    expect(g.view().rent).toMatchObject({ assetId: g.assetAt(11), kind: 'regular' });
    expect(g.send({ type: 'EndTurn', payload: null }).outcome).toBe('accepted');
    expect(g.view().rent).toBeNull();
    g.timers.advance(BOT_DELAY_MS);
    expect(g.view().rent).toMatchObject({ assetId: g.assetAt(12), kind: 'energy', diceSum: 9 });
    // Every Update round-tripped through the protocol decoder, and every view carries the current protocol shapes.
    expect(g.frames.every((f) => f.t !== 'Error')).toBe(true);
  });
});
