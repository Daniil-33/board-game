import { describe, expect, it } from 'vitest';
import { BAD_RESPONSE, LobbyRequestError, NETWORK_ERROR, createLobbyApi } from '../api/lobby';
import { fakeFetch, room } from './helpers';

const ROOM = room([['a', 'Alice']]);

describe('lobby api', () => {
  it('logs a guest in with the nickname and no token', async () => {
    const { fetchFn, calls } = fakeFetch(() => ({ body: { guestId: 'a', token: 'tok-a' } }));
    await expect(createLobbyApi(fetchFn).guestLogin('bob')).resolves.toEqual({ guestId: 'a', token: 'tok-a' });
    expect(calls[0]).toMatchObject({ method: 'POST', path: '/api/guests', body: { nickname: 'bob' } });
    expect(calls[0]!.headers.authorization).toBeUndefined();
  });

  it('uses the fixed routes with a bearer token and no body', async () => {
    const { fetchFn, calls } = fakeFetch((call) =>
      call.method === 'GET' ? { body: { rooms: [ROOM] } } : { body: { room: ROOM } },
    );
    const api = createLobbyApi(fetchFn);
    await api.createRoom('tok-a');
    await expect(api.listRooms('tok-a')).resolves.toEqual([ROOM]);
    await api.joinRoom('tok-a', 'r 1');
    await api.startGame('tok-a', 'r1');
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'POST /api/rooms',
      'GET /api/rooms',
      'POST /api/rooms/r%201/join',
      'POST /api/rooms/r1/start',
    ]);
    for (const call of calls) {
      expect(call.headers.authorization).toBe('Bearer tok-a');
      expect(call.body).toBeUndefined();
      expect(call.headers['content-type']).toBeUndefined();
    }
  });

  it('passes a lobby error body through', async () => {
    const { fetchFn } = fakeFetch(() => ({ status: 403, body: { code: 'NOT_ROOM_CREATOR', message: 'no' } }));
    const failure = await createLobbyApi(fetchFn).startGame('tok-a', 'r1').catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(LobbyRequestError);
    expect(failure).toMatchObject({ code: 'NOT_ROOM_CREATOR', message: 'no' });
  });

  it('rejects a response that does not match its schema', async () => {
    const malformed = [
      { rooms: [{ ...ROOM, status: 'archived' }] },
      { rooms: [{ ...ROOM, extra: 1 }] },
      { rooms: 'none' },
      null,
    ];
    for (const body of malformed) {
      const { fetchFn } = fakeFetch(() => ({ body }));
      await expect(createLobbyApi(fetchFn).listRooms('tok-a')).rejects.toMatchObject({ code: BAD_RESPONSE });
    }
  });

  it('rejects an error response without a protocol error body', async () => {
    const { fetchFn } = fakeFetch(() => ({ status: 500, body: 'oops' }));
    await expect(createLobbyApi(fetchFn).listRooms('tok-a')).rejects.toMatchObject({ code: BAD_RESPONSE });
  });

  it('reports an unreachable server', async () => {
    const { fetchFn } = fakeFetch(() => undefined);
    await expect(createLobbyApi(fetchFn).listRooms('tok-a')).rejects.toMatchObject({ code: NETWORK_ERROR });
  });
});
