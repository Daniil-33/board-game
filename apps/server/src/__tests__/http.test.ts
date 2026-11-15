import { describe, expect, it } from 'vitest';
import { CreateRoomRequestSchema, GuestLoginRequestSchema, JoinRoomRequestSchema, RoomParamsSchema } from '@game/protocol';
import { bearerToken, hashToken, newId, newToken } from '../auth/tokens.js';
import { createHttpApp } from '../http/app.js';
import { ApiError, rejection } from '../http/errors.js';
import { hashAccessCode, verifyAccessCode } from '../lobby/access-code.js';
import { inviteLink } from '../lobby/service.js';
import { readConfig } from '../main-config.js';
import { memoryLogger } from './helpers/harness.js';

describe('tokens and ids', () => {
  it('a token is 43 base64url characters and differs each time', () => {
    const a = newToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newToken()).not.toBe(a);
  });

  it('the stored hash is SHA-256 hex and not the token', () => {
    const token = newToken();
    const hash = hashToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(token);
    expect(hashToken(token)).toBe(hash);
  });

  it('ids carry their prefix and 22 base64url characters', () => {
    expect(newId('g_')).toMatch(/^g_[A-Za-z0-9_-]{22}$/);
    expect(newId('r_')).not.toBe(newId('r_'));
  });

  it.each([
    ['Bearer abc.DEF-1', 'abc.DEF-1'],
    ['bearer abc', null],
    ['Bearer ', null],
    ['Bearer a b', null],
    ['Basic abc', null],
    [undefined, null],
    [['Bearer a'], null],
    ['Bearer ' + 'a'.repeat(513), null],
  ])('bearer %j -> %j', (header, token) => {
    expect(bearerToken(header as string | undefined)).toBe(token);
  });
});

describe('access codes', () => {
  it('hash and verify; the hash holds no code', async () => {
    const stored = await hashAccessCode('Sesame_42');
    expect(stored).toMatch(/^scrypt\$16384\$8\$1\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
    expect(stored).not.toContain('Sesame_42');
    expect(await verifyAccessCode('Sesame_42', stored)).toBe(true);
    expect(await verifyAccessCode('sesame_42', stored)).toBe(false);
    expect(await hashAccessCode('Sesame_42')).not.toBe(stored); // salted
  });

  it.each([
    ['empty', ''],
    ['plain text', 'abcd'],
    ['wrong scheme', 'bcrypt$16384$8$1$c2FsdA$aGFzaA'],
    ['N not a power of two', 'scrypt$1000$8$1$c2FsdHNhbHRzYWx0$' + 'a'.repeat(43)],
    ['N too large', 'scrypt$1073741824$8$1$c2FsdHNhbHRzYWx0$' + 'a'.repeat(43)],
    ['short key', 'scrypt$16384$8$1$c2FsdHNhbHRzYWx0$aGFzaA'],
    ['empty salt', 'scrypt$16384$8$1$$' + 'a'.repeat(43)],
    ['too many parts', 'scrypt$16384$8$1$a$b$c'],
  ])('a malformed stored hash fails closed: %s', async (_name, stored) => {
    expect(await verifyAccessCode('abcd', stored)).toBe(false);
  });

  it('invite link is relative and carries the room id and the code', () => {
    expect(inviteLink('r_abc', 'Sesame_42')).toBe('/?room=r_abc&code=Sesame_42');
  });
});

describe('error mapping', () => {
  it('engine codes are 409 and pass through; room and persistence codes are 503', () => {
    expect(rejection({ code: 'NOT_ENOUGH_PLAYERS', message: 'm' })).toMatchObject({ statusCode: 409, code: 'NOT_ENOUGH_PLAYERS' });
    expect(rejection({ code: 'PERSISTENCE_FAILED', message: 'm' })).toMatchObject({ statusCode: 503 });
    expect(rejection({ code: 'ROOM_UNAVAILABLE', message: 'm' })).toMatchObject({ statusCode: 503 });
  });
});

// spec: server/lobby "Strict request validation" (Ajv options, without a database)
describe('Fastify Ajv options', () => {
  async function app() {
    const logger = memoryLogger();
    const instance = createHttpApp(logger);
    instance.post('/login', { schema: { body: GuestLoginRequestSchema } }, async (req) => req.body);
    instance.post('/create', { schema: { body: CreateRoomRequestSchema } }, async (req) => req.body);
    instance.post('/join/:roomId', { schema: { params: RoomParamsSchema, body: JoinRoomRequestSchema } }, async (req) => req.body);
    instance.get('/boom', async () => {
      throw new Error('secret detail');
    });
    instance.get('/api-error', async () => {
      throw new ApiError(403, 'NOT_ROOM_CREATOR', 'no');
    });
    await instance.ready();
    return { instance, logger };
  }

  const post = async (url: string, payload: unknown) => {
    const { instance } = await app();
    const res = await instance.inject({ method: 'POST', url, payload: payload as object });
    return { status: res.statusCode, body: res.json() };
  };

  it('Unknown property is rejected, not removed', async () => {
    expect(await post('/login', { nickname: 'bob', admin: true })).toMatchObject({ status: 400, body: { code: 'INVALID_REQUEST' } });
  });

  it('No coercion of "1234" or 1234', async () => {
    expect(await post('/create', { accessCode: 1234 })).toMatchObject({ status: 400 });
    expect(await post('/create', { accessCode: true })).toMatchObject({ status: 400 });
    expect(await post('/create', { accessCode: '1234' })).toMatchObject({ status: 200, body: { accessCode: '1234' } });
  });

  it('the nickname format is the protocol rule (astral counted as one, joiner edges rejected)', async () => {
    expect(await post('/login', { nickname: '𝒜'.repeat(24) })).toMatchObject({ status: 200 });
    expect(await post('/login', { nickname: '𝒜'.repeat(25) })).toMatchObject({ status: 400 });
    expect(await post('/login', { nickname: '‍bob' })).toMatchObject({ status: 400 });
    expect(await post('/login', { nickname: '👩‍💻' })).toMatchObject({ status: 200 });
  });

  it('ids with NUL or a lone surrogate are rejected by Ajv (u flag), astral ids accepted', async () => {
    const { instance } = await app();
    const inject = (roomId: string) => instance.inject({ method: 'POST', url: `/join/${encodeURIComponent(roomId)}`, payload: {} });
    expect((await inject('r\u0000')).statusCode).toBe(400);
    expect((await inject('😀')).statusCode).toBe(200);
  });

  it('malformed JSON is 400 INVALID_REQUEST', async () => {
    const { instance } = await app();
    const res = await instance.inject({ method: 'POST', url: '/login', headers: { 'content-type': 'application/json' }, payload: '{"nick' });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: 'INVALID_REQUEST' });
  });

  it('an unexpected error is 500 without details, logged with the request id', async () => {
    const { instance, logger } = await app();
    const res = await instance.inject({ method: 'GET', url: '/boom' });
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain('secret detail');
    expect(logger.lines.some((l) => l.level === 'error' && l.fields['requestId'] !== undefined)).toBe(true);
  });

  it('an ApiError keeps its status and code; unknown routes are 404', async () => {
    const { instance } = await app();
    expect((await instance.inject({ method: 'GET', url: '/api-error' })).json()).toEqual({ code: 'NOT_ROOM_CREATOR', message: 'no' });
    expect((await instance.inject({ method: 'GET', url: '/nope' })).statusCode).toBe(404);
  });

  it('the request log holds no headers, bodies or query strings', async () => {
    const { instance, logger } = await app();
    await instance.inject({ method: 'POST', url: '/create?code=Sesame_42', headers: { authorization: 'Bearer tok-SECRET' }, payload: { accessCode: 'Sesame_42' } });
    const text = JSON.stringify(logger.lines);
    expect(text).not.toContain('Sesame_42');
    expect(text).not.toContain('tok-SECRET');
  });
});

// spec: server/service "Configuration and bind address"
describe('configuration', () => {
  it('defaults to 127.0.0.1:8787', () => {
    expect(readConfig({ DATABASE_URL: 'postgres://x' })).toEqual({ databaseUrl: 'postgres://x', host: '127.0.0.1', port: 8787 });
  });

  it('reads HOST and PORT', () => {
    expect(readConfig({ DATABASE_URL: 'postgres://x', HOST: '0.0.0.0', PORT: '9000' })).toMatchObject({ host: '0.0.0.0', port: 9000 });
  });

  it('requires DATABASE_URL and a numeric PORT', () => {
    expect(() => readConfig({})).toThrow(/DATABASE_URL/);
    expect(() => readConfig({ DATABASE_URL: 'x', PORT: 'http' })).toThrow(/PORT/);
    expect(() => readConfig({ DATABASE_URL: 'x', PORT: '70000' })).toThrow(/PORT/);
  });
});
