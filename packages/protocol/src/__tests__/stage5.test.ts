import { expect, it } from 'vitest';
import { TypeCompiler } from '@sinclair/typebox/compiler';
import { CommandFrameSchema, decodeClientFrame, decodeServerFrame, PROTOCOL_VERSION } from '../index.js';
import { view } from './fixtures.js';

const check = TypeCompiler.Compile(CommandFrameSchema);

it.each(['Mortgage', 'Redeem'])('%s accepts exactly one bounded storable assetId', type => {
  const base = { t: 'Command', commandId: 's5', type, expected: { kind: 'target', target: { kind: 'turn', id: 'turn-3' } } };
  for (const payload of [{ assetId: 'asset-1' }, { assetId: '😀' }, { assetId: 'a'.repeat(128) }]) {
    const frame = { ...base, payload };
    expect(check.Check(frame)).toBe(true);
    expect(decodeClientFrame(JSON.stringify(frame))).toEqual({ ok: true, frame });
  }
  for (const payload of [null, {}, [], 'asset-1', 1, { assetId: '' }, { assetId: 'a'.repeat(129) }, { assetId: '\0' },
    { assetId: '\ud800' }, { assetId: '\udfff' }, { assetId: 1 }, { assetId: null }, { assetId: 'a', extra: 1 }]) {
    expect(check.Check({ ...base, payload })).toBe(false);
    expect(decodeClientFrame(JSON.stringify({ ...base, payload }))).toMatchObject({ ok: false, error: { code: 'MALFORMED_FRAME' } });
  }
  expect(decodeClientFrame(JSON.stringify(base))).toMatchObject({ ok: false, error: { code: 'MALFORMED_FRAME' } });
});

it('round-trips core-7 mortgages, debts, bankruptcy and the final result unchanged', () => {
  const eliminations = [
    { playerId: 'c', reason: 'resigned', at: 1767225600000, creditorId: null },
    { playerId: 'a', reason: 'bankrupt', at: 1767225700000, creditorId: 'b' },
  ];
  const finished = { ...view, phase: 'finished', winner: 'b', finishedAt: 1767225700000, eliminated: ['c', 'a'], eliminations,
    mortgages: { a1: { advance: 30, lapsCompleted: 3, pending: ['b'], remainingLaps: 5 } },
    result: { winner: 'b', finishedAt: 1767225700000, eliminations, finalBalances: { a: 0, b: 1510, c: 0 } } };
  const events = [
    { type: 'AssetMortgaged', payload: { playerId: 'a', assetId: 'a2', advance: 30, auto: true } },
    { type: 'AssetRedeemed', payload: { playerId: 'b', assetId: 'b1', amount: 50 } },
    { type: 'MortgageExpired', payload: { playerId: 'b', assetId: 'b2', advance: 70 } },
    { type: 'LiquidationApplied', payload: { payerId: 'a', creditorId: 'b', debt: 100, cashBefore: 10, raised: 90,
      steps: [{ tier: 1, kind: 'mortgage', assetId: 'a2', amount: 30 }, { tier: 3, kind: 'sell-house', assetId: 'a3', amount: 60 }] } },
    { type: 'PlayerBankrupt', payload: { playerId: 'a', creditorId: 'b', debt: 200, paid: 10, writtenOff: 190 } },
    { type: 'AssetsReleased', payload: { playerId: 'a', assetIds: ['a1'], reason: 'bankrupt' } },
    { type: 'GameEnded', payload: { winner: 'b', at: 1767225700000, eliminations, finalBalances: { a: 0, b: 1510, c: 0 } } },
  ];
  for (const frame of [
    { t: 'Welcome', protocolVersion: PROTOCOL_VERSION, playerId: 'a', revision: 9, view: finished, history: { entries: [], chat: [] } },
    { t: 'Update', revision: 9, view: finished, events },
  ]) expect(decodeServerFrame(JSON.stringify(frame))).toEqual({ ok: true, frame });
});
