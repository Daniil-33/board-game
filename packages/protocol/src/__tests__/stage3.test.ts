import { expect, it } from 'vitest';
import { TypeCompiler } from '@sinclair/typebox/compiler';
import { CommandFrameSchema, decodeClientFrame } from '../index.js';

const check = TypeCompiler.Compile(CommandFrameSchema);
it.each(['BuyAsset', 'StartAuction', 'Bid', 'PassAuction'])('%s accepts only a null payload', type => {
  for (const expected of [
    { kind: 'revision', revision: 7 },
    { kind: 'target', target: { kind: 'auctionResponse', id: 'response-7' } },
  ]) {
    const frame = { t: 'Command', commandId: 'stage3', type, expected, payload: null };
    expect(check.Check(frame)).toBe(true);
    expect(decodeClientFrame(JSON.stringify(frame))).toEqual({ ok: true, frame });
    for (const payload of [{}, [], 0, false, '', { amount: 100 }, { playerId: 'other' }]) {
      expect(check.Check({ ...frame, payload })).toBe(false);
      expect(decodeClientFrame(JSON.stringify({ ...frame, payload }))).toMatchObject({ ok: false, error: { code: 'MALFORMED_FRAME' } });
    }
  }
});
