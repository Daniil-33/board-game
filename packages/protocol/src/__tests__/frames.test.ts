import { describe, expect, expectTypeOf, it } from 'vitest';
import type { Expectation, GameEvent, Revision, StateView } from '@game/game-core';
import {
  CLIENT_COMMAND_TYPES,
  PROTOCOL_ERROR_CODES,
  PROTOCOL_VERSION,
  StateViewSchema,
  decodeClientFrame,
  decodeServerFrame,
  type ClientCommandType,
  type CommandFrame,
  type HelloFrame,
  type UpdateFrame,
  type WelcomeFrame,
} from '../index.js';
import { clientFrames, rev, serverFrames, view } from './fixtures.js';

const enc = (v: unknown) => JSON.stringify(v);
const isMalformed = (r: { ok: boolean; error?: { code: string } }) => !r.ok && r.error?.code === 'MALFORMED_FRAME';

describe('protocol version and codes', () => {
  it('PROTOCOL_VERSION is 4', () => {
    expect(PROTOCOL_VERSION).toBe(4);
  });

  it('lists the seven protocol error codes', () => {
    expect([...PROTOCOL_ERROR_CODES].sort()).toEqual([
      'CONNECTION_REPLACED',
      'MALFORMED_FRAME',
      'NOT_A_PARTICIPANT',
      'PROTOCOL_VERSION_UNSUPPORTED',
      'ROOM_CLOSED',
      'ROOM_UNAVAILABLE',
      'UNAUTHENTICATED',
    ]);
  });

  it('client command types match the stage 3 allowlist', () => {
    expect(CLIENT_COMMAND_TYPES).toEqual(['RollForOrder', 'RollDice', 'EndTurn', 'Resign', 'BuyAsset', 'StartAuction', 'Bid', 'PassAuction', 'PayRent', 'BuildHouse', 'SellHouse']);
    expectTypeOf<CommandFrame['type']>().toEqualTypeOf<ClientCommandType>();
  });
});

describe('static types come from game-core', () => {
  it('view, events, expected, revision', () => {
    expectTypeOf<WelcomeFrame['view']>().toEqualTypeOf<StateView>();
    expectTypeOf<UpdateFrame['events']>().toEqualTypeOf<GameEvent[]>();
    expectTypeOf<CommandFrame['expected']>().toEqualTypeOf<Expectation>();
    expectTypeOf<UpdateFrame['revision']>().toEqualTypeOf<Revision>();
  });

  it('view schema documents the stage 3 public projection and temporary jail rule', () => {
    expect(StateViewSchema.description).toEqual(
      'Public projection of the game state (game-core StateView), checked only as a JSON object. ' +
      'Includes the public generated board, economy, balances, asset owners, purchase decision, auction state, houses, rent and rent quotes. ' +
      'Interim jail state in this view is temporary (stage 1 interim rule, replaced in stage 6).',
    );
  });
});

describe('round trip', () => {
  it.each(clientFrames.map((f) => [f.t, f] as const))('client %s', (_t, frame) => {
    expect(decodeClientFrame(enc(frame))).toEqual({ ok: true, frame });
  });

  it.each(serverFrames.map((f) => [f.t, f] as const))('server %s', (_t, frame) => {
    expect(decodeServerFrame(enc(frame))).toEqual({ ok: true, frame });
  });

  it('wrong direction is malformed', () => {
    for (const f of clientFrames) expect(isMalformed(decodeServerFrame(enc(f)))).toBe(true);
    for (const f of serverFrames) expect(isMalformed(decodeClientFrame(enc(f)))).toBe(true);
  });
});

describe('closed schemas', () => {
  const command = clientFrames[2]!;

  it('rejects a client actor', () => {
    const r = decodeClientFrame(enc({ ...command, actor: { kind: 'player', id: 'p1' } }));
    expect(isMalformed(r)).toBe(true);
  });

  it('rejects a system actor on Hello too', () => {
    expect(isMalformed(decodeClientFrame(enc({ ...clientFrames[0]!, actor: { kind: 'system' } })))).toBe(true);
  });

  it.each(clientFrames.map((f) => [f.t, f] as const))('rejects an extra top-level field on client %s', (_t, f) => {
    expect(isMalformed(decodeClientFrame(enc({ ...f, extra: 1 })))).toBe(true);
  });

  it.each(serverFrames.map((f) => [f.t, f] as const))('rejects an extra top-level field on server %s', (_t, f) => {
    expect(isMalformed(decodeServerFrame(enc({ ...f, extra: 1 })))).toBe(true);
  });

  it('rejects extra fields in nested objects', () => {
    const bad = [
      { ...command, expected: { kind: 'revision', revision: 0, extra: true } },
      { ...command, expected: { kind: 'target', target: { kind: 'turn', id: 't', extra: true } } },
    ];
    for (const f of bad) expect(isMalformed(decodeClientFrame(enc(f)))).toBe(true);

    const badServer = [
      { t: 'Ack', commandId: 'c', outcome: 'rejected', revision: 1, error: { code: 'X', message: 'm', extra: 1 } },
      { t: 'Update', revision: 1, view, events: [{ type: 'E', payload: null, extra: 1 }] },
    ];
    for (const f of badServer) expect(isMalformed(decodeServerFrame(enc(f)))).toBe(true);
  });

  it('allows arbitrary content inside view and event payloads', () => {
    const f = { t: 'Update', revision: 1, view: { anything: { deep: [1] } }, events: [{ type: 'E', payload: { x: [{ y: 1 }] } }] };
    expect(decodeServerFrame(enc(f)).ok).toBe(true);
  });

  it('rejects a non-null command payload while payloads are stubbed', () => {
    expect(isMalformed(decodeClientFrame(enc({ ...command, payload: {} })))).toBe(true);
  });
});

describe('field validation', () => {
  const hello = clientFrames[0] as HelloFrame;
  const command = clientFrames[2] as CommandFrame;

  it.each([
    ['unknown command type', { ...command, type: 'Timeout' }],
    ['lifecycle command type', { ...command, type: 'StartGame' }],
    ['LeaveLobby command type', { ...command, type: 'LeaveLobby' }],
    ['AddPlayer command type', { ...command, type: 'AddPlayer' }],
    ['commandId with NUL', { ...command, commandId: 'a\u0000b' }],
    ['commandId with lone high surrogate', { ...command, commandId: 'a\ud800' }],
    ['commandId with lone low surrogate', { ...command, commandId: '\udc00a' }],
    ['commandId with reversed pair', { ...command, commandId: '\udc00\ud800' }],
    ['gameId with NUL', { ...hello, gameId: '\u0000' }],
    ['gameId with lone surrogate', { ...hello, gameId: 'room\udbff' }],
    ['target id with NUL', { ...command, expected: { kind: 'target', target: { kind: 'turn', id: 't\u0000' } } }],
    ['target kind with lone surrogate', { ...command, expected: { kind: 'target', target: { kind: '\ud800', id: 't' } } }],
    ['missing payload', (({ payload: _p, ...rest }) => rest)(command)],
    ['empty commandId', { ...command, commandId: '' }],
    ['commandId too long', { ...command, commandId: 'x'.repeat(129) }],
    ['negative revision', { ...command, expected: { kind: 'revision', revision: -1 } }],
    ['fractional revision', { ...command, expected: { kind: 'revision', revision: 1.5 } }],
    ['revision as string', { ...command, expected: { kind: 'revision', revision: '1' } }],
    ['unknown expectation kind', { ...command, expected: { kind: 'none' } }],
    ['missing lastRevision', (({ lastRevision: _l, ...rest }) => rest)(hello)],
    ['protocolVersion as string', { ...hello, protocolVersion: '1' }],
    ['empty token', { ...hello, token: '' }],
    ['token with whitespace', { ...hello, token: 'a b' }],
    ['token too long', { ...hello, token: 'a'.repeat(513) }],
    ['empty gameId', { ...hello, gameId: '' }],
  ])('client: %s', (_name, frame) => {
    expect(isMalformed(decodeClientFrame(enc(frame)))).toBe(true);
  });

  it('accepts astral characters in ids (valid surrogate pairs)', () => {
    const f = { ...command, commandId: 'a😀', expected: { kind: 'target', target: { kind: 'turn', id: '𝒜' } } };
    expect(decodeClientFrame(enc(f))).toEqual({ ok: true, frame: f });
    expect(decodeClientFrame(enc({ ...hello, gameId: '😀' })).ok).toBe(true);
  });

  it('rejects a server frame whose player id holds NUL', () => {
    expect(isMalformed(decodeServerFrame(enc({ t: 'Welcome', protocolVersion: 1, playerId: 'p\u0000', revision: 0, view })))).toBe(true);
  });

  it('accepts other protocol versions so the server can answer PROTOCOL_VERSION_UNSUPPORTED', () => {
    expect(decodeClientFrame(enc({ ...hello, protocolVersion: 1 })).ok).toBe(true);
  });

  it.each([
    ['accepted ack with error', { t: 'Ack', commandId: 'c', outcome: 'accepted', revision: 1, error: { code: 'X', message: '' } }],
    ['rejected ack without error', { t: 'Ack', commandId: 'c', outcome: 'rejected', revision: 1 }],
    ['unknown outcome', { t: 'Ack', commandId: 'c', outcome: 'maybe', revision: 1 }],
    ['view null', { t: 'Update', revision: 1, view: null, events: [] }],
    ['view array', { t: 'Update', revision: 1, view: [], events: [] }],
    ['events not array', { t: 'Update', revision: 1, view, events: {} }],
    ['event without type', { t: 'Update', revision: 1, view, events: [{ payload: 1 }] }],
    ['event without payload', { t: 'Update', revision: 1, view, events: [{ type: 'E' }] }],
    ['empty error code', { t: 'Error', code: '', message: 'm' }],
    ['error code over 64 characters', { t: 'Error', code: 'X'.repeat(65), message: 'm' }],
    ['ack error code over 64 characters', { t: 'Ack', commandId: 'c', outcome: 'rejected', revision: 1, error: { code: 'X'.repeat(65), message: 'm' } }],
    ['welcome without view', { t: 'Welcome', protocolVersion: 1, playerId: 'p', revision: 0 }],
  ])('server: %s', (_name, frame) => {
    expect(isMalformed(decodeServerFrame(enc(frame)))).toBe(true);
  });

  it('accepts an error code of exactly 64 characters', () => {
    expect(decodeServerFrame(enc({ t: 'Error', code: 'X'.repeat(64), message: 'm' })).ok).toBe(true);
  });

  it('accepts a payload-less event as payload null', () => {
    expect(decodeServerFrame(enc({ t: 'Update', revision: 1, view, events: [{ type: 'TurnEnded', payload: null }] })).ok).toBe(true);
  });

  it('engine error codes pass through unchanged', () => {
    const f = { t: 'Ack', commandId: 'c', outcome: 'rejected', revision: rev(2), error: { code: 'TARGET_MISMATCH', message: 'm' } };
    expect(decodeServerFrame(enc(f))).toEqual({ ok: true, frame: f });
  });
});
