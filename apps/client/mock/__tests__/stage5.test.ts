// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { Value } from '@sinclair/typebox/value';
import { mortgageAdvance, type AssetId, type GameEvent, type StateView } from '@game/game-core';
import { PROTOCOL_VERSION, GuestLoginResponseSchema, decodeServerFrame, type AckFrame, type ClientFrame, type ServerFrame } from '@game/protocol';
import { debtNotices } from '../../src/game/debts';
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

/** The stage 5 scenario through the mock socket; every frame is decoded with the protocol decoders. */
function stage5() {
  const timers = fakeTimers();
  const mock = new MockServer({ turnMs: 45_000, continuationMs: 20_000, timers, scenario: 'stage5' });
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

describe('mock stage 5 scenario', () => {
  it('scripts liquidation, mortgage expiry, the viewer\'s bankruptcy, watching and the game result', () => {
    const g = stage5();
    while (g.view().setup) {
      if (g.view().setup!.playerId === g.guestId) expect(g.send({ type: 'RollForOrder', payload: null }).outcome).toBe('accepted');
      else g.timers.advance(BOT_DELAY_MS);
    }
    const [me, ada, ben] = g.view().order!;
    expect(me).toBe(g.guestId);
    expect(g.view().players.map((p) => p.id)).toEqual([me, ada, ben]);
    // Seeded: the creator's energy 12 is mortgaged with the whole term ahead, Ada's logistics 35 is about to expire.
    expect(g.view().mortgages[g.assetAt(12)]).toMatchObject({ advance: mortgageAdvance(g.view().board!.cells[12]!.asset!.price), remainingLaps: 8, pending: [me, ada, ben] });
    expect(g.view().mortgages[g.assetAt(35)]).toMatchObject({ remainingLaps: 1 });
    expect(g.view().rentQuotes[g.assetAt(12)]).toEqual({ kind: 'fixed', amount: 0 });

    // Round 1: nothing due for the creator and Ada; Ben owes Ada 2870 and liquidates in every tier.
    expect(g.send({ type: 'RollDice', payload: null }).outcome).toBe('accepted');
    expect(g.view().rent).toBeNull();
    expect(g.send({ type: 'EndTurn', payload: null }).outcome).toBe('accepted');
    expect(g.view().mortgages[g.assetAt(12)]!.pending).toEqual([ada, ben]);
    let mark = g.frames.length;
    g.timers.advance(BOT_DELAY_MS * 4);
    const round = g.eventsSince(mark);
    const [liquidation] = debtNotices(round);
    expect(liquidation).toMatchObject({ kind: 'liquidation', payerId: ben, creditorId: ada, debt: 2870, payment: 2870 });
    if (liquidation?.kind !== 'liquidation') throw new Error('liquidation expected');
    expect(liquidation.steps.map((s) => `${s.tier}:${s.kind}`)).toEqual(['1:mortgage', '2:mortgage', '2:mortgage', '2:mortgage', '3:sell-house', '3:mortgage']);
    expect(round.find((e) => e.type === 'MortgageExpired')!.payload).toMatchObject({ playerId: ada, assetId: g.assetAt(35) });
    expect(g.view().mortgages[g.assetAt(35)]).toBeUndefined();
    expect(g.view().owners[g.assetAt(35)]).toBeUndefined();
    expect(g.view().mortgages[g.assetAt(12)]).toMatchObject({ remainingLaps: 7, pending: [me, ada, ben] });
    expect(g.view().turn!.playerId).toBe(me);

    // Round 2: the creator lands on Ada's 29 and goes bankrupt, then keeps receiving the game.
    expect(g.send({ type: 'RollDice', payload: null }).outcome).toBe('accepted');
    expect(g.view().rent).toMatchObject({ payerId: me, ownerId: ada, amount: 2870 });
    mark = g.frames.length;
    expect(g.send({ type: 'EndTurn', payload: null }).outcome).toBe('accepted');
    const [bankruptcy] = debtNotices(g.eventsSince(mark));
    expect(bankruptcy).toMatchObject({ kind: 'bankruptcy', playerId: me, creditorId: ada, debt: 2870, assetIds: [g.assetAt(1), g.assetAt(3), g.assetAt(12)] });
    expect(g.view().eliminations).toMatchObject([{ playerId: me, reason: 'bankrupt', creditorId: ada }]);
    expect(g.view().phase).toBe('playing');
    expect(g.send({ type: 'RollDice', payload: null }).outcome).toBe('rejected');

    // Ada moves on, Ben goes bankrupt to Ada and the game ends.
    mark = g.frames.length;
    g.timers.advance(BOT_DELAY_MS * 4);
    expect(debtNotices(g.eventsSince(mark))).toMatchObject([{ kind: 'bankruptcy', playerId: ben, creditorId: ada }]);
    const result = g.view().result!;
    expect(g.view().phase).toBe('finished');
    expect(result.winner).toBe(ada);
    expect(result.eliminations.map((e) => [e.playerId, e.reason])).toEqual([[me, 'bankrupt'], [ben, 'bankrupt']]);
    expect(Object.keys(result.finalBalances).sort()).toEqual([me, ada, ben].sort());
    expect(g.frames.every((f) => f.t !== 'Error')).toBe(true);
  });
});
