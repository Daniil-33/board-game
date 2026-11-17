import {
  projectEvents,
  projectState,
  type GameCommand,
  type GameEvent,
  type GameState,
  type PlayerId,
  type Viewer,
} from '@game/game-core';
import {
  MAX_FRAME_LENGTH,
  PROTOCOL_VERSION,
  decodeClientFrame,
  type AckFrame,
  type ChatAckFrame,
  type ChatMessage,
  type ChatSendFrame,
  type CommandFrame,
  type HelloFrame,
  type History,
  type ServerFrame,
  type WelcomeFrame,
} from '@game/protocol';
import type { WebSocket } from 'ws';
import type { GuestStore } from '../auth/guests.js';
import type { RoomQueries } from '../lobby/queries.js';
import { errorFields, type Logger } from '../logger.js';
import type { StoredChatMessage, StoredHistory } from '../db/game-store.js';
import { RoomNotFoundError, type Room, type RoomEvent, type RoomManager } from '../rooms/types.js';
import type { ConnectionRegistry, Replaceable } from './registry.js';

/** The first frame must arrive within this time. */
export const HELLO_TIMEOUT_MS = 10_000;
/** A socket whose unsent output exceeds this is dropped; the client reconnects with Hello. */
export const MAX_BUFFERED_BYTES = 4 * 1024 * 1024;
/** Frames received but not yet handled; a client that floods past this is disconnected. */
export const MAX_QUEUED_FRAMES = 64;

/** Close codes. Clients act on the `Error` frame sent before the close; these are informative. */
export const CLOSE = {
  normal: 1000,
  policy: 1008,
  serverError: 1011,
  replaced: 4001,
} as const;

export interface ConnectionDeps {
  readonly guests: GuestStore;
  readonly queries: RoomQueries;
  readonly manager: RoomManager;
  readonly registry: ConnectionRegistry<GameConnection>;
  readonly logger: Logger;
  /** Default `HELLO_TIMEOUT_MS`. */
  readonly helloTimeoutMs?: number;
  /**
   * The per-viewer event filter for `Update` and `Welcome.history`. Default:
   * game-core `projectEvents`. Tests only: every core event is public today.
   */
  readonly projectEvents?: ProjectEvents;
}

type Phase = 'awaitingHello' | 'authenticating' | 'ready' | 'closed';

const OPEN = 1;

const isMember = (state: GameState, guestId: string): boolean => state.players.some((p) => p.id === guestId);

const chatMessage = (m: StoredChatMessage): ChatMessage => ({ seq: m.seq, authorId: m.authorId as PlayerId, text: m.text, at: m.at });

/** A Welcome longer than this (UTF-16 units) is logged: 75% of the client's decode limit. */
export const WELCOME_WARN_LENGTH = Math.floor(MAX_FRAME_LENGTH * 0.75);

type ProjectEvents = (events: readonly GameEvent[], viewer: Viewer) => GameEvent[];

/** The stored history as `viewer` may see it: projected events, empty entries dropped, oldest first. */
export function viewerHistory(stored: StoredHistory, viewer: Viewer, project: ProjectEvents = projectEvents): History {
  const entries: History['entries'] = [];
  for (const entry of stored.entries) {
    const events = project(entry.events, viewer);
    if (events.length > 0) entries.push({ revision: entry.revision, at: entry.now, events });
  }
  return { entries, chat: stored.chat.map(chatMessage) };
}

/** The `Welcome` a player receives for `state` and the room's stored history. */
export function welcomeFrame(
  state: GameState,
  viewer: { readonly kind: 'player'; readonly id: PlayerId },
  stored: StoredHistory,
  project: ProjectEvents = projectEvents,
): WelcomeFrame {
  return {
    t: 'Welcome',
    protocolVersion: PROTOCOL_VERSION,
    playerId: viewer.id,
    revision: state.revision,
    view: projectState(state, viewer),
    history: viewerHistory(stored, viewer, project),
  };
}

/**
 * One game socket: `Hello` -> `Welcome`, then `Command` -> `Ack` and room
 * updates -> `Update`. Frames are handled one at a time, in arrival order.
 * Closing the socket only unsubscribes: it is never resignation.
 */
export class GameConnection implements Replaceable {
  private phase: Phase = 'awaitingHello';
  private queue: Promise<void> = Promise.resolve();
  private queued = 0;
  private helloTimer: ReturnType<typeof setTimeout> | null = null;
  private unsubscribe: (() => void) | null = null;
  private room: Room | null = null;
  private guestId: string | null = null;
  private viewer: { readonly kind: 'player'; readonly id: PlayerId } | null = null;
  /** Revision of the last view this socket was sent (Welcome or Update). */
  private sentRevision = -1;
  /** Room events that arrive between subscribing and sending Welcome; replayed after it. */
  private early: RoomEvent[] | null = null;

  constructor(
    private readonly socket: WebSocket,
    private readonly deps: ConnectionDeps,
  ) {}

  /** Attach handlers; must run synchronously in the upgrade handler so no frame is missed. */
  start(): void {
    this.helloTimer = setTimeout(() => {
      if (this.phase === 'awaitingHello') this.fail('MALFORMED_FRAME', 'Hello was not received in time', CLOSE.policy);
    }, this.deps.helloTimeoutMs ?? HELLO_TIMEOUT_MS);
    this.socket.on('message', (data, isBinary) => this.enqueue(isBinary ? null : data.toString()));
    this.socket.on('close', () => this.cleanup());
    this.socket.on('error', (error) => {
      this.deps.logger.warn('game socket error', { roomId: this.room?.gameId, guestId: this.guestId, ...errorFields(error) });
    });
  }

  /** A newer socket of the same guest took over the room. */
  replaced(): void {
    this.fail('CONNECTION_REPLACED', 'This room was opened in another connection', CLOSE.replaced);
  }

  private get closed(): boolean {
    return this.phase === 'closed';
  }

  // ---- Inbound --------------------------------------------------------------

  private enqueue(raw: string | null): void {
    if (this.phase === 'closed') return;
    if (++this.queued > MAX_QUEUED_FRAMES) {
      this.fail('MALFORMED_FRAME', 'Too many frames in flight', CLOSE.policy);
      return;
    }
    this.queue = this.queue
      .then(() => (this.phase === 'closed' ? undefined : this.handle(raw)))
      .catch((error: unknown) => {
        this.deps.logger.error('game socket frame failed', { roomId: this.room?.gameId, guestId: this.guestId, ...errorFields(error) });
        this.fail('ROOM_UNAVAILABLE', 'The server could not handle the frame', CLOSE.serverError);
      })
      .finally(() => {
        this.queued--;
      });
  }

  private async handle(raw: string | null): Promise<void> {
    const decoded = decodeClientFrame(raw);
    if (this.phase === 'awaitingHello') {
      if (!decoded.ok || decoded.frame.t !== 'Hello') {
        this.fail('MALFORMED_FRAME', decoded.ok ? 'The first frame must be Hello' : decoded.error.message, CLOSE.policy);
        return;
      }
      await this.hello(decoded.frame);
      return;
    }
    if (!decoded.ok) {
      this.send({ t: 'Error', code: 'MALFORMED_FRAME', message: decoded.error.message });
      return;
    }
    if (decoded.frame.t === 'Hello') {
      this.send({ t: 'Error', code: 'MALFORMED_FRAME', message: 'Hello was already received' });
      return;
    }
    if (decoded.frame.t === 'ChatSend') {
      await this.chat(decoded.frame);
      return;
    }
    await this.command(decoded.frame);
  }

  private async hello(frame: HelloFrame): Promise<void> {
    this.phase = 'authenticating';
    this.clearHelloTimer();
    if (frame.protocolVersion !== PROTOCOL_VERSION) {
      this.fail('PROTOCOL_VERSION_UNSUPPORTED', `The server speaks protocol version ${PROTOCOL_VERSION}`, CLOSE.policy);
      return;
    }
    const guest = await this.deps.guests.findByToken(frame.token);
    if (guest === null) {
      this.fail('UNAUTHENTICATED', 'A valid guest token is required', CLOSE.policy);
      return;
    }
    const row = await this.deps.queries.findRoom(frame.gameId);
    if (row === null) {
      this.fail('ROOM_UNAVAILABLE', 'The room does not exist', CLOSE.policy);
      return;
    }
    if (row.status === 'closed') {
      this.fail('ROOM_CLOSED', 'The room was closed', CLOSE.normal);
      return;
    }
    let room: Room;
    try {
      room = await this.deps.manager.open(frame.gameId);
    } catch (error) {
      if (!(error instanceof RoomNotFoundError)) {
        this.deps.logger.error('room could not be opened for a socket', { roomId: frame.gameId, ...errorFields(error) });
      }
      this.fail('ROOM_UNAVAILABLE', 'The room is unavailable', CLOSE.serverError);
      return;
    }
    if (this.closed) return; // the socket went away meanwhile
    if (room.status === 'closed') {
      this.fail('ROOM_CLOSED', 'The room was closed', CLOSE.normal);
      return;
    }
    if (room.status === 'failed') {
      this.fail('ROOM_UNAVAILABLE', 'The room is unavailable', CLOSE.serverError);
      return;
    }
    if (!isMember(room.state, guest.guestId)) {
      this.fail('NOT_A_PARTICIPANT', 'You are not a member of this room', CLOSE.policy);
      return;
    }

    // The room reads the history and subscribes in one step of its queue:
    // every later commit or chat message arrives as an Update or Chat, and none
    // is also in the history. Events that reach the listener before Welcome is
    // sent are held and replayed after it.
    this.room = room;
    this.guestId = guest.guestId;
    const viewer = { kind: 'player', id: guest.guestId as PlayerId } as const;
    this.viewer = viewer;
    this.early = [];
    const attached = await room.attach((event) => this.onRoomEvent(event));
    if (this.closed) {
      if (attached.ok) attached.unsubscribe();
      return;
    }
    if (!attached.ok) {
      if ((room.status as Room['status']) === 'closed') this.fail('ROOM_CLOSED', 'The room was closed', CLOSE.normal);
      else this.fail('ROOM_UNAVAILABLE', 'The room is unavailable', CLOSE.serverError);
      return;
    }
    this.unsubscribe = attached.unsubscribe;
    const state = attached.state;
    if (!isMember(state, guest.guestId)) {
      this.fail('NOT_A_PARTICIPANT', 'You are not a member of this room', CLOSE.policy);
      return;
    }
    const welcome = JSON.stringify(welcomeFrame(state, viewer, attached.history, this.deps.projectEvents ?? projectEvents));
    if (welcome.length > WELCOME_WARN_LENGTH) {
      this.deps.logger.warn('Welcome frame nears the client frame limit', {
        roomId: room.gameId,
        guestId: guest.guestId,
        length: welcome.length,
        limit: MAX_FRAME_LENGTH,
      });
    }
    this.sentRevision = state.revision;
    this.phase = 'ready';
    this.sendText(welcome);
    const early = this.early;
    this.early = null;
    for (const event of early) this.onRoomEvent(event);
    if (this.closed) return;
    this.deps.registry.register(room.gameId, guest.guestId, this);
    this.deps.logger.info('game socket joined', {
      roomId: room.gameId,
      guestId: guest.guestId,
      revision: state.revision,
      lastRevision: frame.lastRevision,
    });
  }

  private async command(frame: CommandFrame): Promise<void> {
    const room = this.room!;
    const command: GameCommand = {
      type: frame.type,
      commandId: frame.commandId,
      actor: this.viewer!,
      expected: frame.expected,
      payload: frame.payload,
    };
    const result = await room.submit(command);
    const ack: AckFrame =
      result.kind === 'accepted'
        ? { t: 'Ack', commandId: frame.commandId, outcome: 'accepted', revision: result.revision }
        : {
            t: 'Ack',
            commandId: frame.commandId,
            outcome: 'rejected',
            revision: result.revision,
            error: { code: result.error.code, message: result.error.message },
          };
    this.send(ack);
  }

  private async chat(frame: ChatSendFrame): Promise<void> {
    const result = await this.room!.chat(this.guestId!, frame.text);
    // Every connection of the room, this one included, already has the Chat frame.
    const ack: ChatAckFrame = result.ok
      ? { t: 'ChatAck', clientMsgId: frame.clientMsgId, ok: true }
      : { t: 'ChatAck', clientMsgId: frame.clientMsgId, ok: false, reason: result.reason };
    this.send(ack);
  }

  // ---- Room events ----------------------------------------------------------

  private onRoomEvent(event: RoomEvent): void {
    if (this.early !== null && this.phase !== 'closed') {
      this.early.push(event);
      return;
    }
    if (this.phase !== 'ready') return;
    switch (event.kind) {
      case 'update':
        this.update(event.revision, event.state, event.events);
        return;
      case 'resync':
        this.update(event.revision, event.state, []);
        return;
      case 'failed':
        this.fail('ROOM_UNAVAILABLE', 'The room is unavailable', CLOSE.serverError);
        return;
      case 'closed':
        this.fail('ROOM_CLOSED', 'The room was closed by its creator', CLOSE.normal);
        return;
      case 'chat':
        this.send({ t: 'Chat', message: chatMessage(event.message) });
        return;
    }
  }

  private update(revision: number, state: GameState, events: readonly GameEvent[]): void {
    if (revision <= this.sentRevision) return;
    this.sentRevision = revision;
    const viewer = this.viewer!;
    const project = this.deps.projectEvents ?? projectEvents;
    this.send({ t: 'Update', revision: state.revision, view: projectState(state, viewer), events: project(events, viewer) });
    if (!isMember(state, this.guestId!)) {
      this.fail('NOT_A_PARTICIPANT', 'You left this room', CLOSE.normal);
    }
  }

  // ---- Outbound -------------------------------------------------------------

  private send(frame: ServerFrame): void {
    this.sendText(JSON.stringify(frame));
  }

  private sendText(text: string): void {
    if (this.socket.readyState !== OPEN) return;
    if (this.socket.bufferedAmount > MAX_BUFFERED_BYTES) {
      this.deps.logger.warn('game socket too slow; dropped', { roomId: this.room?.gameId, guestId: this.guestId });
      this.socket.terminate();
      this.cleanup();
      return;
    }
    this.socket.send(text);
  }

  /** Send `Error { code }` and close. Idempotent. */
  private fail(code: string, message: string, closeCode: number): void {
    if (this.phase === 'closed') return;
    this.send({ t: 'Error', code, message });
    this.cleanup();
    if (this.socket.readyState === OPEN) this.socket.close(closeCode, code);
  }

  private clearHelloTimer(): void {
    if (this.helloTimer !== null) clearTimeout(this.helloTimer);
    this.helloTimer = null;
  }

  private cleanup(): void {
    if (this.phase === 'closed') return;
    this.phase = 'closed';
    this.clearHelloTimer();
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (this.room !== null && this.guestId !== null) this.deps.registry.unregister(this.room.gameId, this.guestId, this);
  }
}
