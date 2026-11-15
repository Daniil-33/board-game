import { describe, expect, it } from 'vitest';
import { TypeCompiler } from '@sinclair/typebox/compiler';
import type { TSchema } from '@sinclair/typebox';
import {
  AuthHeadersSchema,
  AccessCodeSchema,
  CreateRoomRequestSchema,
  CreateRoomResponseSchema,
  GetRoomResponseSchema,
  GuestLoginRequestSchema,
  GuestLoginResponseSchema,
  JoinRoomRequestSchema,
  JoinRoomResponseSchema,
  LOBBY_ERROR_CODES,
  LeaveRoomResponseSchema,
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
  locked: false,
  joinable: true,
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
    ['ZWJ only', '\u200D', false],
    ['ZWNJ and ZWJ only', '\u200C\u200D', false],
    ['leading ZWJ', '\u200Dbob', false],
    ['trailing ZWNJ', 'bob\u200C', false],
    ['leading ZWNJ before emoji', '\u200C🎲', false],
    ['ZWJ emoji (woman technologist)', '👩\u200D💻', true],
    ['ZWJ family (man, woman, girl)', '👨\u200D👩\u200D👧', true],
    ['Persian name with ZWNJ', 'مهر\u200Cآسا', true],
    ['zero-width space (Cf)', 'a\u200Bb', false],
    ['soft hyphen (Cf)', 'a\u00ADb', false],
    ['word joiner (Cf)', 'a\u2060b', false],
    ['BOM inside (Cf)', 'a\uFEFFb', false],
    ['RTL override (Cf)', 'a\u202Eb', false],
    ['line separator', 'a\u2028b', false],
    ['paragraph separator', 'a\u2029b', false],
    ['private use', 'a\uE000', false],
    ['lone surrogate', 'a\uD800', false],
    ['unassigned', 'a\u0378', false],
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
    expect(
      check(CreateRoomResponseSchema, {
        room: { ...room, locked: true, joinable: false },
        accessCode: 'abcd',
        inviteLink: '/?room=r1&code=abcd',
      }),
    ).toBe(true);
    expect(check(GetRoomResponseSchema, { room })).toBe(true);
    expect(check(LeaveRoomResponseSchema, { room: { ...room, status: 'closed', joinable: false } })).toBe(true);
    expect(check(JoinRoomResponseSchema, { room })).toBe(true);
    expect(check(StartGameResponseSchema, { room: { ...room, status: 'playing' } })).toBe(true);
    expect(check(ListRoomsResponseSchema, { rooms: [room] })).toBe(true);
    expect(check(ListRoomsResponseSchema, { rooms: [] })).toBe(true);
    expect(check(RoomParamsSchema, { roomId: 'r1' })).toBe(true);
  });

  it('every room status passes', () => {
    for (const status of ['lobby', 'playing', 'finished', 'closed']) {
      expect(check(GetRoomResponseSchema, { room: { ...room, status } })).toBe(true);
    }
  });

  it('summary flags are required', () => {
    const { locked: _l, ...noLocked } = room;
    const { joinable: _j, ...noJoinable } = room;
    expect(check(GetRoomResponseSchema, { room: noLocked })).toBe(false);
    expect(check(GetRoomResponseSchema, { room: noJoinable })).toBe(false);
    expect(check(GetRoomResponseSchema, { room: { ...room, locked: 'no' } })).toBe(false);
  });

  it.each([
    ['abc', false],
    ['abcd', true],
    ['a'.repeat(32), true],
    ['a'.repeat(33), false],
    ['ab cd', false],
    ['abc/', false],
    ['Az09_-', true],
    ['абвг', false],
    ['abcd\n', false],
  ])('access code %j -> %s', (code, valid) => {
    expect(check(AccessCodeSchema, code)).toBe(valid);
    expect(check(CreateRoomRequestSchema, { accessCode: code })).toBe(valid);
    expect(check(JoinRoomRequestSchema, { accessCode: code })).toBe(valid);
  });

  it('create and join requests may be empty', () => {
    expect(check(CreateRoomRequestSchema, {})).toBe(true);
    expect(check(JoinRoomRequestSchema, {})).toBe(true);
    expect(check(JoinRoomRequestSchema, { accessCode: 1234 })).toBe(false);
  });

  it('error body accepts lobby, protocol and engine codes', () => {
    expect(LOBBY_ERROR_CODES).toEqual(['NOT_ROOM_CREATOR', 'INVALID_REQUEST', 'ACCESS_CODE_REQUIRED', 'ACCESS_CODE_INVALID']);
    for (const code of [
      'NOT_ROOM_CREATOR',
      'INVALID_REQUEST',
      'ACCESS_CODE_REQUIRED',
      'ACCESS_CODE_INVALID',
      'UNAUTHENTICATED',
      'ROOM_UNAVAILABLE',
      'ROOM_CLOSED',
      'NOT_ENOUGH_PLAYERS',
    ]) {
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
    ['unknown status', CreateRoomResponseSchema, { room: { ...room, status: 'archived' } }],
    ['create request extra field', CreateRoomRequestSchema, { accessCode: 'abcd', public: true }],
    ['join request extra field', JoinRoomRequestSchema, { accessCode: 'abcd', seat: 1 }],
    ['create response extra field', CreateRoomResponseSchema, { room, secret: 'x' }],
    ['get response extra field', GetRoomResponseSchema, { room, extra: 1 }],
    ['leave response extra field', LeaveRoomResponseSchema, { room, extra: 1 }],
    ['roomId with NUL', RoomParamsSchema, { roomId: 'r\u0000' }],
    ['guestId with lone surrogate', GuestLoginResponseSchema, { guestId: 'g\udfff', token: 't' }],
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
