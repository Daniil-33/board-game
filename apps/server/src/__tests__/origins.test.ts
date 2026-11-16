import websocket from '@fastify/websocket';
import Fastify from 'fastify';
import { WebSocket } from 'ws';
import { describe, expect, it } from 'vitest';
import { registerOriginHooks } from '../http/origins.js';

const allowed = 'https://stage.focusima.space';
async function server(origins: readonly string[]) {
  const app = Fastify();
  registerOriginHooks(app, origins);
  await app.register(websocket);
  app.get('/api/test', async () => ({ ok: true }));
  app.get('/ws', { websocket: true }, (socket) => { socket.send('ready'); });
  return app;
}
describe('browser origin transport policy', () => {
  it('grants only matching API origins, including preflights without credentials', async () => {
    const app = await server([allowed]);
    try {
      for (const method of ['GET', 'OPTIONS'] as const) {
        for (const origin of [allowed, 'https://foreign.example']) {
          const res = await app.inject({ method, url: '/api/test', headers: { origin, 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization,content-type' } });
          expect(res.headers['vary']).toBe('Origin');
          expect(res.headers['access-control-allow-origin']).toBe(origin === allowed ? allowed : undefined);
          expect(res.headers['access-control-allow-credentials']).toBeUndefined();
          if (method === 'OPTIONS' && origin === allowed) {
            expect(res.statusCode).toBe(204);
            expect(res.headers['access-control-allow-methods']).toBe('GET, POST');
            expect(res.headers['access-control-allow-headers']).toBe('Authorization, Content-Type');
          }
        }
      }
      expect((await app.inject('/api/test')).headers['access-control-allow-origin']).toBeUndefined();
    } finally { await app.close(); }
  });
  it('does not add CORS headers with policy disabled', async () => {
    const app = await server([]);
    try {
      const res = await app.inject({ url: '/api/test', headers: { origin: allowed } });
      expect(res.statusCode).toBe(200);
      expect(res.headers['vary']).toBeUndefined();
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    } finally { await app.close(); }
  });
  it.each([undefined, 'https://foreign.example'])('rejects actual upgrades with Origin %j before 101 or frames', async (origin) => {
    const app = await server([allowed]);
    const address = await app.listen({ host: '127.0.0.1', port: 0 });
    const ws = new WebSocket(address.replace('http:', 'ws:') + '/ws', origin ? { origin } : {});
    let upgraded = false;
    let frames = 0;
    ws.on('upgrade', () => { upgraded = true; });
    ws.on('message', () => { frames++; });
    try {
      const status = await new Promise<number | undefined>((resolve, reject) => {
        ws.on('error', reject);
        ws.on('unexpected-response', (_req, res) => { res.resume(); resolve(res.statusCode); });
      });
      expect(status).toBe(403);
      expect(upgraded).toBe(false);
      expect(frames).toBe(0);
    } finally { ws.removeAllListeners('error'); ws.on('error', () => {}); ws.terminate(); await app.close(); }
  });
  it.each([
    { origins: [allowed], origin: allowed },
    { origins: [], origin: undefined },
    { origins: [], origin: 'https://foreign.example' },
  ])('accepts upgrades under $origins with Origin $origin', async ({ origins, origin }) => {
    const app = await server(origins);
    const address = await app.listen({ host: '127.0.0.1', port: 0 });
    const ws = new WebSocket(address.replace('http:', 'ws:') + '/ws', origin ? { origin } : {});
    try {
      expect(await new Promise<string>((resolve, reject) => {
        ws.on('error', reject); ws.on('message', (data) => resolve(data.toString()));
      })).toBe('ready');
    } finally { ws.terminate(); await app.close(); }
  });
});
