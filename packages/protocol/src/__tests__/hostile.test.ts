import { describe, expect, it } from 'vitest';
import { MAX_FRAME_LENGTH, decodeClientFrame, decodeServerFrame } from '../index.js';
import { clientFrames, serverFrames } from './fixtures.js';

const deepArray = '['.repeat(200_000) + ']'.repeat(200_000);
const deepObject = '{"t":"Hello","x":'.repeat(50_000) + '1' + '}'.repeat(50_000);
const validHello = JSON.stringify(clientFrames[0]);
const validUpdate = JSON.stringify(serverFrames[3]);

const hostile: [string, unknown][] = [
  ['empty string', ''],
  ['whitespace', '   '],
  ['null', 'null'],
  ['true', 'true'],
  ['number', '42'],
  ['NaN text', 'NaN'],
  ['Infinity text', 'Infinity'],
  ['array', '[]'],
  ['string literal', '"Hello"'],
  ['empty object', '{}'],
  ['tag __proto__', '{"t":"__proto__"}'],
  ['tag constructor', '{"t":"constructor"}'],
  ['tag toString', '{"t":"toString"}'],
  ['tag hasOwnProperty', '{"t":"hasOwnProperty"}'],
  ['tag number', '{"t":1}'],
  ['tag null', '{"t":null}'],
  ['tag object', '{"t":{"x":1}}'],
  ['tag wrong case', '{"t":"hello"}'],
  ['__proto__ key', validHello.replace('{', '{"__proto__":{"t":"Hello"},')],
  ['__proto__ key on update', validUpdate.replace('{', '{"__proto__":{"isAdmin":true},')],
  ['constructor key', validHello.replace('{', '{"constructor":{"prototype":{}},')],
  ['trailing garbage', validHello + 'x'],
  ['truncated', validHello.slice(0, -1)],
  ['single quotes', validHello.replaceAll('"', "'")],
  ['lone surrogate', '{"t":"\uD800"}'],
  ['escaped lone surrogate', '{"t":"Hello","token":"\\uD800","gameId":"g","protocolVersion":1,"lastRevision":null}'],
  ['NUL byte', '\u0000'],
  ['BOM prefix', '\uFEFF' + validHello],
  ['deeply nested arrays', deepArray],
  ['deeply nested objects', deepObject],
  ['huge number', '{"t":"Hello","protocolVersion":1e400,"token":"a","gameId":"g","lastRevision":null}'],
  ['over MAX_FRAME_LENGTH', ' '.repeat(MAX_FRAME_LENGTH + 1)],
  ['valid frame padded over MAX_FRAME_LENGTH', validHello + ' '.repeat(MAX_FRAME_LENGTH)],
  ['non-string: undefined', undefined],
  ['non-string: object', { t: 'Hello' }],
  ['non-string: number', 1],
  ['non-string: Buffer-like', new Uint8Array([123, 125])],
  ['non-string: throwing toString', { toString() { throw new Error('boom'); } }],
];

describe('hostile input never throws and is MALFORMED_FRAME', () => {
  it.each(hostile)('%s', (_name, raw) => {
    for (const decode of [decodeClientFrame, decodeServerFrame]) {
      let result: ReturnType<typeof decode> | undefined;
      expect(() => {
        result = decode(raw);
      }).not.toThrow();
      expect(result).toMatchObject({ ok: false, error: { code: 'MALFORMED_FRAME', message: expect.any(String) } });
    }
  });

  it('does not pollute Object.prototype', () => {
    decodeServerFrame(validUpdate.replace('{', '{"__proto__":{"polluted":true},'));
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('accepts a frame exactly at MAX_FRAME_LENGTH', () => {
    const padded = validHello + ' '.repeat(MAX_FRAME_LENGTH - validHello.length);
    expect(padded.length).toBe(MAX_FRAME_LENGTH);
    expect(decodeClientFrame(padded).ok).toBe(true);
  });
});
