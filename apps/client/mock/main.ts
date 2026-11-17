/**
 * DEV-ONLY entry point: `pnpm --filter @game/client mock`.
 * Serves the mock lobby over HTTP and the mock room over WebSocket on
 * MOCK_PORT (8787). MOCK_TURN_MS shortens turns to watch timeouts;
 * MOCK_SCENARIO=stage4 seeds owners and houses for rent and building;
 * MOCK_SCENARIO=stage5 seats three players for mortgages, liquidation,
 * bankruptcy and the game result (see STAGE5_SEED in script.ts).
 * POST /mock/drop closes every socket, to watch the client reconnect.
 */
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { ROUTES } from '../src/api/routes';
import { MockServer, type MockPeer } from './server';

const port = Number(process.env.MOCK_PORT ?? 8787);
const turnMs = Number(process.env.MOCK_TURN_MS ?? 45_000);
/** MOCK_SCENARIO=stage4 seeds owners and houses to demo rent and building; stage5 demos debts. */
const scenario = process.env.MOCK_SCENARIO === 'stage4' || process.env.MOCK_SCENARIO === 'stage5' ? process.env.MOCK_SCENARIO : undefined;

const mock = new MockServer({
  turnMs,
  continuationMs: Math.min(20_000, turnMs),
  ...(scenario !== undefined && { scenario }),
  timers: {
    now: () => Date.now(),
    setTimeout: (callback, ms) => setTimeout(callback, ms),
    clearTimeout: (handle) => clearTimeout(handle as NodeJS.Timeout),
  },
});

const http = createServer((request, response) => {
  const chunks: Buffer[] = [];
  request.on('data', (chunk: Buffer) => chunks.push(chunk));
  request.on('end', () => {
    const path = (request.url ?? '/').split('?')[0]!;
    let body: unknown;
    try {
      const text = Buffer.concat(chunks).toString('utf8');
      body = text === '' ? undefined : JSON.parse(text);
    } catch {
      body = undefined;
    }
    const reply =
      request.method === 'POST' && path === '/mock/drop'
        ? { status: 200, body: { dropped: mock.dropAll() } }
        : mock.http(request.method ?? 'GET', path, request.headers.authorization, body);
    response.writeHead(reply.status, { 'content-type': 'application/json' });
    response.end(JSON.stringify(reply.body));
  });
});

const sockets = new WebSocketServer({ server: http, path: ROUTES.socket });
sockets.on('connection', (socket) => {
  const peer: MockPeer = {
    send: (frame) => socket.send(JSON.stringify(frame)),
    close: () => socket.close(),
  };
  socket.on('message', (data, isBinary) => mock.message(peer, isBinary ? data : data.toString()));
  socket.on('close', () => mock.disconnect(peer));
});

http.listen(port, '127.0.0.1', () => {
  console.log(`mock server on http://127.0.0.1:${port} (turn ${turnMs} ms)`);
});
