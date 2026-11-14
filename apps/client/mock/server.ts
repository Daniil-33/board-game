/**
 * DEV-ONLY mock of the lobby and the room socket, without any network code:
 * `main.ts` puts it behind HTTP and WebSocket. It speaks `@game/protocol` on
 * the routes of `src/api/routes.ts` and plays the other seats itself.
 */
import {
  PROTOCOL_VERSION,
  decodeClientFrame,
  normalizeNickname,
  type AckFrame,
  type ErrorBody,
  type RoomSummary,
  type ServerFrame,
} from '@game/protocol';
import type { GameEvent } from '@game/game-core';
import { ROUTES } from '../src/api/routes';
import { MockGame, type MockGameOptions } from './game';
import { BOT_DELAY_MS, LOBBY_BOT_DELAY_MS } from './script';

export interface MockTimers {
  now(): number;
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface MockOptions extends MockGameOptions {
  readonly timers: MockTimers;
}

/** One WebSocket connection, as the mock sees it. */
export interface MockPeer {
  send(frame: ServerFrame): void;
  close(): void;
}

export interface HttpReply {
  readonly status: number;
  readonly body: unknown;
}

interface Guest {
  readonly guestId: string;
  readonly token: string;
  readonly nickname: string;
  readonly bot: boolean;
}

interface Room {
  readonly summary: { roomId: string; creatorId: string; status: 'lobby' | 'playing'; members: { guestId: string; nickname: string }[] };
  readonly game: MockGame;
  /** Connected peers and the guest each one said Hello as. */
  readonly peers: Map<MockPeer, string>;
  /** Acks by command id, so a resent command gets its first answer again. */
  readonly acks: Map<string, AckFrame>;
  deadlineTimer: unknown;
  botTimer: unknown;
}

const error = (status: number, code: string, message: string): HttpReply => ({ status, body: { code, message } satisfies ErrorBody });

export class MockServer {
  private readonly guests = new Map<string, Guest>();
  private readonly rooms = new Map<string, Room>();
  private readonly helloed = new Map<MockPeer, Room>();
  private nextId = 1;

  constructor(private readonly options: MockOptions) {
    this.seedDemoRoom();
  }

  // ---- HTTP lobby ------------------------------------------------------------

  http(method: string, path: string, authorization: string | undefined, body: unknown): HttpReply {
    if (method === 'POST' && path === ROUTES.guests) {
      const raw = typeof body === 'object' && body !== null ? (body as { nickname?: unknown }).nickname : undefined;
      const nickname = typeof raw === 'string' ? normalizeNickname(raw) : null;
      if (nickname === null || nickname !== raw) return error(400, 'INVALID_REQUEST', 'A valid nickname is required');
      const guest = this.addGuest(nickname, false);
      return { status: 200, body: { guestId: guest.guestId, token: guest.token } };
    }

    const guest = this.authenticate(authorization);
    if (guest === null) return error(401, 'UNAUTHENTICATED', 'Missing or unknown guest token');

    if (path === ROUTES.rooms && method === 'GET') {
      const rooms = [...this.rooms.values()].filter((r) => r.summary.status === 'lobby').map((r) => summaryOf(r));
      return { status: 200, body: { rooms } };
    }
    if (path === ROUTES.rooms && method === 'POST') {
      const room = this.createRoom(guest);
      // Nobody else is here in a mock: a bot joins so the game can be started.
      this.options.timers.setTimeout(() => this.join(room, this.addGuest('Bot Ada', true)), LOBBY_BOT_DELAY_MS);
      return { status: 200, body: { room: summaryOf(room) } };
    }

    const match = /^\/api\/rooms\/([^/]+)\/(join|start)$/.exec(path);
    if (method !== 'POST' || match === null) return error(404, 'INVALID_REQUEST', `No route ${method} ${path}`);
    const room = this.rooms.get(decodeURIComponent(match[1]!));
    if (room === undefined) return error(404, 'ROOM_UNAVAILABLE', 'No such room');

    if (match[2] === 'join') {
      if (!this.isMember(room, guest.guestId)) {
        if (room.summary.status !== 'lobby') return error(409, 'ROOM_UNAVAILABLE', 'The game has already started');
        if (room.summary.members.length >= 6) return error(409, 'PLAYER_LIMIT_REACHED', 'The room is full');
        this.join(room, guest);
        // A room hosted by a bot starts by itself shortly after a human sits down.
        if (this.guestById(room.summary.creatorId)?.bot) {
          this.options.timers.setTimeout(() => this.start(room), LOBBY_BOT_DELAY_MS);
        }
      }
      return { status: 200, body: { room: summaryOf(room) } };
    }

    if (room.summary.creatorId !== guest.guestId) return error(403, 'NOT_ROOM_CREATOR', 'Only the room creator may start the game');
    if (room.summary.status !== 'lobby') return error(409, 'ROOM_UNAVAILABLE', 'The game has already started');
    if (room.summary.members.length < 2) return error(409, 'NOT_ENOUGH_PLAYERS', 'At least 2 players are required');
    this.start(room);
    return { status: 200, body: { room: summaryOf(room) } };
  }

  // ---- WebSocket -------------------------------------------------------------

  /** Text received from a peer. */
  message(peer: MockPeer, raw: unknown): void {
    const decoded = decodeClientFrame(raw);
    if (!decoded.ok) return peer.send({ t: 'Error', code: decoded.error.code, message: decoded.error.message });
    const frame = decoded.frame;

    if (frame.t === 'Hello') {
      if (frame.protocolVersion !== PROTOCOL_VERSION) {
        return peer.send({ t: 'Error', code: 'PROTOCOL_VERSION_UNSUPPORTED', message: `Server speaks protocol ${PROTOCOL_VERSION}` });
      }
      const guest = this.guestByToken(frame.token);
      if (guest === null) return peer.send({ t: 'Error', code: 'UNAUTHENTICATED', message: 'Unknown guest token' });
      const room = this.rooms.get(frame.gameId);
      if (room === undefined) return peer.send({ t: 'Error', code: 'ROOM_UNAVAILABLE', message: 'No such room' });
      if (!this.isMember(room, guest.guestId)) {
        return peer.send({ t: 'Error', code: 'NOT_A_PARTICIPANT', message: 'You are not a member of this room' });
      }
      this.disconnect(peer);
      room.peers.set(peer, guest.guestId);
      this.helloed.set(peer, room);
      // No delta replay in stage 1: always the full current view.
      const view = room.game.view;
      return peer.send({ t: 'Welcome', protocolVersion: PROTOCOL_VERSION, playerId: view.players.find((p) => p.id === guest.guestId)!.id, revision: view.revision, view });
    }

    const room = this.helloed.get(peer);
    const playerId = room?.peers.get(peer);
    if (room === undefined || playerId === undefined) {
      return peer.send({ t: 'Error', code: 'UNAUTHENTICATED', message: 'Hello is required before commands' });
    }
    const known = room.acks.get(frame.commandId);
    if (known !== undefined) return peer.send(known);

    const result = room.game.command(playerId, frame.type, frame.expected, this.options.timers.now());
    const ack: AckFrame = result.ok
      ? { t: 'Ack', commandId: frame.commandId, outcome: 'accepted', revision: room.game.revision }
      : { t: 'Ack', commandId: frame.commandId, outcome: 'rejected', revision: room.game.revision, error: result.error };
    room.acks.set(frame.commandId, ack);
    peer.send(ack);
    if (result.ok) this.changed(room, result.events);
  }

  /** The peer's socket closed. */
  disconnect(peer: MockPeer): void {
    this.helloed.get(peer)?.peers.delete(peer);
    this.helloed.delete(peer);
  }

  /** Close every socket, to demo reconnect. Returns how many were closed. */
  dropAll(): number {
    const peers = [...this.helloed.keys()];
    for (const peer of peers) {
      this.disconnect(peer);
      peer.close();
    }
    return peers.length;
  }

  // ---- Internals -------------------------------------------------------------

  private addGuest(nickname: string, bot: boolean): Guest {
    const id = this.nextId++;
    const guest: Guest = { guestId: `g${id}`, token: `mock-token-${id}`, nickname, bot };
    this.guests.set(guest.token, guest);
    return guest;
  }

  private authenticate(authorization: string | undefined): Guest | null {
    const match = /^Bearer (.+)$/.exec(authorization ?? '');
    return match === null ? null : this.guestByToken(match[1]!);
  }

  private guestByToken(token: string): Guest | null {
    return this.guests.get(token) ?? null;
  }

  private guestById(guestId: string): Guest | null {
    for (const guest of this.guests.values()) if (guest.guestId === guestId) return guest;
    return null;
  }

  private isMember(room: Room, guestId: string): boolean {
    return room.summary.members.some((m) => m.guestId === guestId);
  }

  private createRoom(creator: Guest): Room {
    const roomId = `r${this.nextId++}`;
    const room: Room = {
      summary: { roomId, creatorId: creator.guestId, status: 'lobby', members: [] },
      game: new MockGame(this.options),
      peers: new Map(),
      acks: new Map(),
      deadlineTimer: null,
      botTimer: null,
    };
    this.rooms.set(roomId, room);
    this.join(room, creator);
    return room;
  }

  /** A room hosted by two bots, so the lobby always has something to join. */
  private seedDemoRoom(): void {
    const room = this.createRoom(this.addGuest('Bot Grace', true));
    this.join(room, this.addGuest('Bot Linus', true));
  }

  private join(room: Room, guest: Guest): void {
    if (room.summary.status !== 'lobby' || this.isMember(room, guest.guestId)) return;
    room.summary.members.push({ guestId: guest.guestId, nickname: guest.nickname });
    this.changed(room, room.game.addPlayer(guest.guestId));
  }

  private start(room: Room): void {
    if (room.summary.status !== 'lobby') return;
    const hostedByBot = this.guestById(room.summary.creatorId)?.bot === true;
    room.summary.status = 'playing';
    this.changed(room, room.game.start(this.options.timers.now()));
    if (hostedByBot) this.seedDemoRoom();
  }

  /** The game moved on: tell every peer, then arm the deadline and the bot seat. */
  private changed(room: Room, events: readonly GameEvent[]): void {
    const view = room.game.view;
    for (const peer of room.peers.keys()) peer.send({ t: 'Update', revision: view.revision, view, events: [...events] });

    const { timers } = this.options;
    if (room.deadlineTimer !== null) timers.clearTimeout(room.deadlineTimer);
    if (room.botTimer !== null) timers.clearTimeout(room.botTimer);
    room.deadlineTimer = null;
    room.botTimer = null;

    const waiting = room.game.waitingFor;
    if (waiting === null) return;
    room.deadlineTimer = timers.setTimeout(() => {
      room.deadlineTimer = null;
      const timedOut = room.game.timeout(timers.now());
      if (timedOut !== null) this.changed(room, timedOut);
    }, Math.max(0, waiting.deadline - timers.now()));

    if (this.guestById(waiting.playerId)?.bot !== true) return;
    room.botTimer = timers.setTimeout(() => {
      room.botTimer = null;
      const current = room.game.view;
      const type = current.setup !== null ? 'RollForOrder' : current.turn?.rolled ? 'EndTurn' : 'RollDice';
      const target =
        current.setup !== null
          ? { kind: 'setupRoll', id: current.setup.setupRollId }
          : { kind: 'turn', id: current.turn!.turnId };
      const result = room.game.command(waiting.playerId, type, { kind: 'target', target }, timers.now());
      if (result.ok) this.changed(room, result.events);
    }, BOT_DELAY_MS);
  }
}

function summaryOf(room: Room): RoomSummary {
  return JSON.parse(JSON.stringify(room.summary)) as RoomSummary;
}
