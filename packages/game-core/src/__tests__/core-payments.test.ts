import { describe, expect, it } from 'vitest';
import { checkInvariants, gameEngine, openCharge, settleDebt, type GameCommand, type GameState, type Money, type PlayerId } from '../index.js';
import { playingGame } from './helpers/game.js';
import { cmd, ctx, pid, player } from './helpers/fixtures.js';

const money = (n: number) => n as Money;
const command = (state: GameState, type: string, payload: unknown = null, actor = state.turn!.playerId): GameCommand =>
  cmd(type, payload, { actor: player(actor), target: { kind: 'turn', id: state.turn!.turnId } });
const rolled = (state: GameState): GameState => ({ ...state, turn: { ...state.turn!, rolled: true } });
const base = () => rolled(playingGame(['a', 'b', 'c']).state);
const charge = (state: GameState, amount: number): GameState => openCharge(state, money(amount)).state;

function accepted(state: GameState, type: string, payload: unknown = null, at = ctx().now) {
  const input = type === 'Resign' ? cmd(type, payload, { actor: player(state.turn!.playerId), rev: state.revision }) : command(state, type, payload);
  const result = gameEngine.execute(state, input, ctx(at));
  if (result.kind !== 'accepted') throw new Error(result.error.code);
  checkInvariants(result.state);
  return result;
}

describe('bank charge settlement', () => {
  it.each([
    { players: ['a', 'b'], balance: 100 },
    { players: ['a', 'b'], balance: 10 },
    { players: ['a', 'b', 'c'], balance: 100 },
    { players: ['a', 'b', 'c'], balance: 10 },
  ])('voids the resigning payer charge in $players.length players with balance $balance', ({ players, balance }) => {
    const source = playingGame(players).state;
    const s = charge({ ...source, balances: { ...source.balances, a: money(balance) } }, 60);
    const result = accepted(s, 'Resign');
    expect(result.state.charge).toBeNull();
    expect(result.state.balances).toEqual(s.balances);
    expect(result.events.some(event => event.type === 'ChargePaid')).toBe(false);
    expect(result.events.some(event => event.type === 'BalanceChanged')).toBe(false);
    if (players.length === 2) {
      const withoutCharge = accepted({ ...source, balances: { ...source.balances, a: money(balance) } }, 'Resign');
      expect(result.state).toEqual(withoutCharge.state);
      expect(result.events).toEqual(withoutCharge.events);
      expect(result.state.phase).toBe('finished');
    } else {
      expect(result.state.phase).toBe('playing');
      expect(result.state.turn!.playerId).toBe('b');
      checkInvariants(result.state);
    }
  });

  it('debits a cash charge without crediting a player', () => {
    const s = charge({ ...base(), balances: { ...base().balances, a: money(100) } }, 60);
    expect(openCharge(base(), money(60)).events).toEqual([{ type: 'ChargeDue', payload: { payerId: 'a', amount: 60, cause: 'chance' } }]);
    const result = accepted(s, 'PayCharge');
    expect(result.state.balances).toMatchObject({ a: 40, b: s.balances.b, c: s.balances.c });
    expect(result.events).toEqual([
      { type: 'BalanceChanged', payload: { playerId: 'a', delta: -60, balance: 40, reason: 'chance' } },
      { type: 'ChargePaid', payload: { payerId: 'a', amount: 60, auto: false } },
    ]);
    expect(result.state.charge).toBeNull();
  });

  it.each(['EndTurn', 'Timeout'] as const)('automatically settles at %s', type => {
    const source = base();
    const s = charge({ ...source, balances: { ...source.balances, a: money(100) } }, 60);
    const cmd = type === 'Timeout' ?
      { ...command(s, type), actor: { kind: 'system' as const }, expected: { kind: 'target' as const, target: { kind: 'turn', id: s.turn!.turnId } } } : command(s, type);
    const result = gameEngine.execute(s, cmd, ctx(type === 'Timeout' ? s.turn!.deadline : ctx().now));
    expect(result.kind).toBe('accepted');
    if (result.kind === 'accepted') {
      expect(result.events).toContainEqual({ type: 'ChargePaid', payload: { payerId: 'a', amount: 60, auto: true } });
      expect(result.state.charge).toBeNull();
      checkInvariants(result.state);
    }
  });

  it('uses tiered mortgage liquidation without crediting a player', () => {
    const initial = base();
    const asset = initial.board!.cells[1]!.asset!;
    const s = charge({ ...initial, owners: { [asset.assetId]: pid('a') }, balances: { ...initial.balances, a: money(10) } }, 300);
    const result = accepted(s, 'PayCharge');
    expect(result.events.find(e => e.type === 'LiquidationApplied')?.payload).toMatchObject({ payerId: 'a', creditorId: null, debt: 300 });
    expect(result.events).toContainEqual(expect.objectContaining({ type: 'ChargePaid', payload: { payerId: 'a', amount: 300, auto: false } }));
    expect(result.state.balances.b).toBe(s.balances.b);
    const mortgaged = result.state.mortgages[asset.assetId]!;
    expect(mortgaged.lockedTurnId).toBe(s.turn!.turnId);
  });

  it('bankruptcy pays cash plus house refunds, releases assets, and records a null creditor', () => {
    const initial = base();
    const group = initial.board!.cells.filter(c => c.asset?.groupId === 'M2');
    const assets = group.map(c => c.asset!);
    const houses = Object.fromEntries(assets.map(a => [a.assetId, 1]));
    const s = charge({ ...initial, owners: Object.fromEntries(assets.map(a => [a.assetId, pid('a')])), houses,
      balances: { ...initial.balances, a: money(10) } }, 100000);
    const result = accepted(s, 'PayCharge');
    const paid = 10 + result.events.filter(e => e.type === 'HouseSold').reduce((n, e) => n + Number((e.payload as { refund: number }).refund), 0);
    expect(result.events.find(e => e.type === 'PlayerBankrupt')?.payload).toEqual({ playerId: 'a', creditorId: null, debt: 100000, paid, writtenOff: 100000 - paid });
    expect(result.events.find(e => e.type === 'BalanceChanged' && (e.payload as { reason: string }).reason === 'chance')?.payload).toMatchObject({ playerId: 'a', delta: -paid });
    expect(result.state.balances.b).toBe(s.balances.b);
    expect(result.state.eliminated).toContain('a');
    expect(Object.values(result.state.owners)).not.toContain('a');
    expect(result.state.houses).toEqual({});
    expect(result.state.mortgages).toEqual({});
  });

  it('keeps bank payment creditor values distinct from player rent settlement', () => {
    const s = base();
    const asset = s.board!.cells[1]!.asset!;
    const settled = settleDebt({ ...s, balances: { ...s.balances, a: money(100) } }, {
      payerId: pid('a'), creditor: { kind: 'bank' }, amount: money(60), cause: { kind: 'chance', auto: false },
    }, ctx().now);
    expect(settled.state.balances.a).toBe(40);
    expect(settled.state.balances.b).toBe(s.balances.b);
    expect(settled.events.at(-1)).toEqual({ type: 'ChargePaid', payload: { payerId: 'a', amount: 60, auto: false } });
    expect(asset.assetId).toBeTruthy();
  });

  it('rejects a bank creditor for rent before applying any debit', () => {
    const s = { ...base(), balances: { ...base().balances, a: money(100) } };
    expect(() => settleDebt(s, {
      payerId: pid('a'), creditor: { kind: 'bank' }, amount: money(60),
      cause: { kind: 'rent', assetId: s.board!.cells[1]!.asset!.assetId, auto: false },
    }, ctx().now)).toThrow('Rent must have a player creditor');
    expect(s.balances.a).toBe(100);
  });
});
