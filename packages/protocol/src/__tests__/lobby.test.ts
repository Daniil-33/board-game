import { describe, expect, it } from 'vitest';
import { TypeCompiler } from '@sinclair/typebox/compiler';
import type { TSchema } from '@sinclair/typebox';
import {
  AuthHeadersSchema,
  CreateRoomResponseSchema,
  GuestLoginRequestSchema,
  GuestLoginResponseSchema,
  JoinRoomResponseSchema,
  LOBBY_ERROR_CODES,
  ListRoomsResponseSchema,
  LobbyErrorSchema,
  NICKNAME_FORMAT,
  RoomParamsSchema,
  StartGameResponseSchema,
  isValidNickname,
  normalizeNickname,
  type RoomSummary,
} from '../index.js';

const check = (schema: TSchema, value: unknown) => TypeCompiler.Compile(schema).Check(value);

const room: RoomSummary = {
  roomId: 'r1',
  creatorId: 'g1',
  status: 'lobby',
  members: [
    { guestId: 'g1', nickname: 'Алиса' },
    { guestId: 'g2', nickname: 'bob 🎲' },
  ],
};

describe('nickname', () => {
  const astral = '𝒜'; // 1 code point, 2 UTF-16 units

  it.each([
    ['empty', '', false],
    ['1 code point', 'a', true],
    ['1 astral code point', astral, true],
    ['24 code points', 'a'.repeat(24), true],
    ['24 astral code points', astral.repeat(24), true],
    ['25 code points', 'a'.repeat(25), false],
    ['25 astral code points', astral.repeat(25), false],
    ['inner space', 'big bob', true],
    ['cyrillic', 'Даниил', true],
    ['emoji', '🎲🎲', true],
    ['leading space', ' bob', false],
    ['trailing space', 'bob ', false],
    ['only spaces', '   ', false],
    ['tab inside', 'a\tb', false],
    ['newline inside', 'a\nb', false],
    ['NUL', 'a\u0000', false],
    ['zero-width space (Cf)', 'a​b', false],
    ['RTL override (Cf)', 'a‮b', false],
    ['line separator', 'a b', false],
    ['paragraph separator', 'a b', false],
    ['private use', 'a', false],
    ['lone surrogate', 'a\uD800', false],
    ['unassigned', 'a͸', false],
  ])('%s', (_name, value, valid) => {
    expect(isValidNickname(value)).toBe(valid);
    expect(NICKNAME_FORMAT.validate(value)).toBe(valid);
    expect(check(GuestLoginRequestSchema, { nickname: value })).toBe(valid);
  });

  it('rejects non-strings', () => {
    for (const v of [null, undefined, 1, {}, ['a']]) expect(isValidNickname(v)).toBe(false);
  });

  it('normalizes by trimming', () => {
    expect(isValidNickname(' bob ')).toBe(false);
    expect(normalizeNickname(' bob ')).toBe('bob');
    expect(normalizeNickname('   ')).toBeNull();
    expect(normalizeNickname(` ${'a'.repeat(25)} `)).toBeNull();
  });
});

describe('lobby schemas', () => {
  it('guest login round trip', () => {
    expect(check(GuestLoginRequestSchema, { nickname: 'bob' })).toBe(true);
    expect(check(GuestLoginResponseSchema, { guestId: 'g1', token: 'tok.123' })).toBe(true);
  });

  it('room responses', () => {
    expect(check(CreateRoomResponseSchema, { room })).toBe(true);
    expect(check(JoinRoomResponseSchema, { room })).toBe(true);
    expect(check(StartGameResponseSchema, { room: { ...room, status: 'playing' } })).toBe(true);
    expect(check(ListRoomsResponseSchema, { rooms: [room] })).toBe(true);
    expect(check(ListRoomsResponseSchema, { rooms: [] })).toBe(true);
    expect(check(RoomParamsSchema, { roomId: 'r1' })).toBe(true);
  });

  it('error body accepts lobby, protocol and engine codes', () => {
    expect(LOBBY_ERROR_CODES).toEqual(['NOT_ROOM_CREATOR', 'INVALID_REQUEST']);
    for (const code of ['NOT_ROOM_CREATOR', 'INVALID_REQUEST', 'UNAUTHENTICATED', 'ROOM_UNAVAILABLE', 'NOT_ENOUGH_PLAYERS']) {
      expect(check(LobbyErrorSchema, { code, message: 'm' })).toBe(true);
    }
  });

  it.each([
    ['login extra field', GuestLoginRequestSchema, { nickname: 'bob', admin: true }],
    ['login missing nickname', GuestLoginRequestSchema, {}],
    ['login untrimmed nickname', GuestLoginRequestSchema, { nickname: ' bob' }],
    ['login response extra field', GuestLoginResponseSchema, { guestId: 'g', token: 't', x: 1 }],
    ['params extra field', RoomParamsSchema, { roomId: 'r1', other: 'x' }],
    ['params empty roomId', RoomParamsSchema, { roomId: '' }],
    ['room extra field', CreateRoomResponseSchema, { room: { ...room, maxPlayers: 6 } }],
    ['member extra field', CreateRoomResponseSchema, { room: { ...room, members: [{ guestId: 'g', nickname: 'n', token: 't' }] } }],
    ['unknown status', CreateRoomResponseSchema, { room: { ...room, status: 'finished' } }],
    ['list extra field', ListRoomsResponseSchema, { rooms: [], total: 0 }],
    ['error extra field', LobbyErrorSchema, { code: 'X', message: 'm', stack: '' }],
  ])('rejects %s', (_name, schema, value) => {
    expect(check(schema, value)).toBe(false);
  });

  it.each([
    ['Bearer tok.123', true],
    ['Bearer ' + 'a'.repeat(512), true],
    ['Bearer ' + 'a'.repeat(513), false],
    ['bearer tok', false],
    ['Bearer ', false],
    ['Bearer a b', false],
    ['Basic dXNlcg==', false],
    ['tok', false],
  ])('authorization header %j -> %s', (value, valid) => {
    expect(check(AuthHeadersSchema, { authorization: value, host: 'example' })).toBe(valid);
  });

  it('requires the authorization header', () => {
    expect(check(AuthHeadersSchema, { host: 'example' })).toBe(false);
  });
});
