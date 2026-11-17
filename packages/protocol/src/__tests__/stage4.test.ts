import { expect, it } from 'vitest';
import { decodeClientFrame } from '../index.js';

it.each(['PayRent', 'BuildHouse', 'SellHouse'])('%s validates its closed payload', type => {
  const base = { t: 'Command', commandId: 's4', type, expected: { kind: 'revision', revision: 7 } };
  const valid = type === 'PayRent' ? [null] : [{ assetId: 'asset-1' }, { assetId: '😀' }];
  const invalid = type === 'PayRent' ? [{}, [], 1, false, { assetId: 'a' }]
    : [null, {}, [], { assetId: '' }, { assetId: 'a'.repeat(129) }, { assetId: '\0' },
      { assetId: '\ud800' }, { assetId: '\udfff' }, { assetId: 1 }, { assetId: 'a', extra: 1 }];
  for (const payload of valid) {
    const frame = { ...base, payload };
    expect(decodeClientFrame(JSON.stringify(frame))).toEqual({ ok: true, frame });
  }
  for (const payload of [...invalid, undefined]) expect(decodeClientFrame(JSON.stringify({ ...base, payload }))).toMatchObject({ ok: false });
});

it('round-trips public stage 4 settlement, houses, quotes and event payloads', async () => {
  const { view } = await import('./fixtures.js');
  const { decodeServerFrame, PROTOCOL_VERSION } = await import('../index.js');
  const publicView = { ...view, houses: { a1: 1 }, rent: {
    payerId: 'a', ownerId: 'b', assetId: 'a1', cell: 3, kind: 'regular', amount: 100, diceSum: null,
  }, rentQuotes: { a1: { kind: 'fixed', amount: 100 } }, balances: { a: 900, b: 1100 } };
  const events = [
    { type: 'RentDue', payload: { payerId: 'a', ownerId: 'b', assetId: 'a1', kind: 'regular', amount: 100, diceSum: null } },
    { type: 'RentPaid', payload: { payerId: 'a', ownerId: 'b', assetId: 'a1', amount: 100, auto: false } },
    { type: 'HouseBuilt', payload: { playerId: 'b', assetId: 'a1', houses: 1, cost: 100 } },
    { type: 'HouseSold', payload: { playerId: 'b', assetId: 'a1', houses: 0, refund: 50 } },
    { type: 'BalanceChanged', payload: { playerId: 'a', before: 1000, after: 900, reason: 'rent' } },
  ];
  for (const frame of [
    { t: 'Welcome', protocolVersion: PROTOCOL_VERSION, playerId: 'a', revision: 7, view: publicView },
    { t: 'Update', revision: 7, view: publicView, events },
  ]) expect(decodeServerFrame(JSON.stringify(frame))).toEqual({ ok: true, frame });
});
