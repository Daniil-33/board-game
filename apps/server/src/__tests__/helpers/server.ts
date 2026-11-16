import { PROTOCOL_VERSION } from '@game/protocol';
import type { AddressInfo } from 'node:net';
import { decodeServerFrame, type ClientFrame, type ServerFrame } from '@game/protocol';
import type { FastifyInstance } from 'fastify';
import { WebSocket } from 'ws';
import { createServer } from '../../server.js';
import type { Context, Harness } from './harness.js';
import type { RoomManager } from '../../rooms/types.js';

export interface TestServer extends Context {
  readonly app: FastifyInstance;
  readonly manager: RoomManager;
  readonly baseUrl: string;
  readonly wsUrl: string;
  /** Close the app (sockets) then shut the manager down, like SIGTERM. */
  stop(): Promise<void>;
}

/** A listening server on 127.0.0.1 and a random port, over the harness database and a fake clock. */
export async function startServer(h: Harness, options: { helloTimeoutMs?: number; restore?: boolean } = {}): Promise<TestServer> {
  const ctx = h.manager();
  if (options.restore) await ctx.manager.restoreAll();
  const app = await createServer({
    db: h.db,
    manager: ctx.manager,
    logger: ctx.logger,
    ...(options.helloTimeoutMs !== undefined ? { helloTimeoutMs: options.helloTimeoutMs } : {}),
  });
  await app.listen({ host: '127.0.0.1', port: 0 });
  const { port } = app.server.address() as AddressInfo;
  let stopped: Promise<void> | null = null;
  const server: TestServer = {
    ...ctx,
    app,
    baseUrl: `http://127.0.0.1:${port}`,
    wsUrl: `ws://127.0.0.1:${port}/ws`,
    stop() {
      stopped ??= (async () => {
        await app.close();
        await ctx.manager.shutdown();
      })();
      return stopped;
    },
  };
  servers.push(server);
  return server;
}

const servers: TestServer[] = [];

/** Stop every server started by the test (call from `afterEach`, before the harness drops the database). */
export async function stopServers(): Promise<void> {
  for (const s of servers.splice(0)) await s.stop();
}

export interface HttpResult<T = unknown> {
  readonly status: number;
  readonly body: T;
}

/** One JSON request. `body: undefined` sends no body and no content type. */
export async function http<T = any>(
  server: { baseUrl: string },
  method: 'GET' | 'POST',
  path: string,
  options: { token?: string; body?: unknown; rawBody?: string; headers?: Record<string, string> } = {},
): Promise<HttpResult<T>> {
  const headers: Record<string, string> = { ...options.headers };
  if (options.token !== undefined) headers['authorization'] = `Bearer ${options.token}`;
  let body: string | undefined;
  if (options.rawBody !== undefined) {
    body = options.rawBody;
    headers['content-type'] ??= 'application/json';
  } else if (options.body !== undefined) {
    body = JSON.stringify(options.body);
    headers['content-type'] = 'application/json';
  }
  const response = await fetch(server.baseUrl + path, { method, headers, ...(body !== undefined ? { body } : {}) });
  const text = await response.text();
  return { status: response.status, body: (text === '' ? undefined : JSON.parse(text)) as T };
}

export interface TestGuest {
  readonly guestId: string;
  readonly token: string;
  readonly nickname: string;
}

export async function login(server: { baseUrl: string }, nickname: string): Promise<TestGuest> {
  const res = await http(server, 'POST', '/api/guests', { body: { nickname } });
  if (res.status !== 201) throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { ...res.body, nickname };
}

/** Throws unless the response has `status`; returns its body. */
export function expectStatus<T = any>(res: HttpResult, status: number): T {
  if (res.status !== status) throw new Error(`expected HTTP ${status}, got ${res.status} ${JSON.stringify(res.body)}`);
  return res.body as T;
}

const DEFAULT_WAIT_MS = 5000;

/** A WebSocket client that decodes every server frame and lets a test wait for the next matching one. */
export class TestSocket {
  readonly frames: ServerFrame[] = [];
  private cursor = 0;
  private waiters: (() => void)[] = [];
  closeCode: number | null = null;
  private readonly closed: Promise<number>;
  private readonly opened: Promise<void>;

  constructor(readonly ws: WebSocket) {
    this.opened = new Promise((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', reject);
    });
    this.closed = new Promise((resolve) => {
      ws.on('close', (code) => {
        this.closeCode = code;
        this.wake();
        resolve(code);
      });
    });
    ws.on('message', (data) => {
      const decoded = decodeServerFrame(data.toString());
      if (!decoded.ok) throw new Error(`server sent a malformed frame: ${decoded.error.message}`);
      this.frames.push(decoded.frame);
      this.wake();
    });
  }

  static async open(url: string): Promise<TestSocket> {
    const socket = new TestSocket(new WebSocket(url));
    await socket.opened;
    return socket;
  }

  private wake(): void {
    for (const w of this.waiters.splice(0)) w();
  }

  send(frame: ClientFrame | Record<string, unknown>): void {
    this.ws.send(JSON.stringify(frame));
  }

  sendRaw(text: string): void {
    this.ws.send(text);
  }

  /** The next unread frame matching `predicate` (frames before it are skipped). */
  async next<F extends ServerFrame = ServerFrame>(
    predicate: (frame: ServerFrame) => boolean = () => true,
    timeoutMs = DEFAULT_WAIT_MS,
  ): Promise<F> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      while (this.cursor < this.frames.length) {
        const frame = this.frames[this.cursor++]!;
        if (predicate(frame)) return frame as F;
      }
      if (this.closeCode !== null) throw new Error(`socket closed (${this.closeCode}) before a matching frame; got ${JSON.stringify(this.frames)}`);
      const left = deadline - Date.now();
      if (left <= 0) throw new Error(`no matching frame within ${timeoutMs} ms; got ${JSON.stringify(this.frames)}`);
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, left);
        this.waiters.push(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
  }

  /** A frame matching `predicate` among everything received, read or not; waits for one if none yet. */
  async seen<F extends ServerFrame = ServerFrame>(predicate: (frame: ServerFrame) => boolean, timeoutMs = DEFAULT_WAIT_MS): Promise<F> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const found = this.frames.find(predicate);
      if (found !== undefined) return found as F;
      if (this.closeCode !== null) throw new Error(`socket closed (${this.closeCode}) before a matching frame`);
      const left = deadline - Date.now();
      if (left <= 0) throw new Error(`no matching frame within ${timeoutMs} ms; got ${JSON.stringify(this.frames)}`);
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, left);
        this.waiters.push(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
  }

  nextOf<T extends ServerFrame['t']>(t: T, timeoutMs?: number): Promise<Extract<ServerFrame, { t: T }>> {
    return this.next((f) => f.t === t, timeoutMs) as Promise<Extract<ServerFrame, { t: T }>>;
  }

  /** Resolves with the close code once the server (or the test) closed the socket. */
  whenClosed(timeoutMs = DEFAULT_WAIT_MS): Promise<number> {
    return Promise.race([
      this.closed,
      new Promise<number>((_, reject) => setTimeout(() => reject(new Error('socket did not close')), timeoutMs)),
    ]);
  }

  /** Frames received but not read with `next` yet. */
  unread(): ServerFrame[] {
    return this.frames.slice(this.cursor);
  }

  close(): void {
    this.ws.close();
  }

  /** Drop the connection without a close handshake, like a lost network. */
  drop(): void {
    this.ws.terminate();
  }
}

/** Open a socket and say Hello; resolves with the socket and its Welcome. */
export async function connect(
  server: { wsUrl: string },
  guest: { token: string },
  roomId: string,
  lastRevision: number | null = null,
) {
  const socket = await TestSocket.open(server.wsUrl);
  socket.send({ t: 'Hello', protocolVersion: PROTOCOL_VERSION, token: guest.token, gameId: roomId, lastRevision });
  const welcome = await socket.nextOf('Welcome');
  return { socket, welcome };
}
