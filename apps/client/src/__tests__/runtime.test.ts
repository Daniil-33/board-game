import { describe, expect, it, vi } from 'vitest';
import { runtimeApi } from '../shared/api/index';
import { createLobbyApi } from '../shared/api/index';

describe('runtime API selection', () => {
  it.each([
    ['https://api.example', 'wss://api.example/ws'],
    ['http://localhost:8787', 'ws://localhost:8787/ws'],
    ['', 'wss://web.example/ws'],
    [undefined, 'wss://web.example/ws'],
  ])('selects REST and socket for %j', async (origin, socket) => {
    const api = runtimeApi({ protocol: 'https:', host: 'web.example' }, origin);
    expect(api.socketUrl).toBe(socket);
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ rooms: [] })));
    await createLobbyApi(api.fetch(fetchFn)).listRooms('token');
    expect(fetchFn).toHaveBeenCalledWith(`${origin ?? ''}/api/rooms`, expect.objectContaining({
      method: 'GET', headers: expect.objectContaining({ authorization: 'Bearer token' }),
      ...(origin ? { credentials: 'omit' } : {}),
    }));
  });
  it('keeps HTTP same-origin sockets', () => {
    expect(runtimeApi({ protocol: 'http:', host: 'localhost:5173' }).socketUrl).toBe('ws://localhost:5173/ws');
  });
});
