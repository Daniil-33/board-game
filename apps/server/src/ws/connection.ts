import { projectEvents, projectState, type GameCommand, type GameEvent, type GameState, type PlayerId } from '@game/game-core';
import {
  PROTOCOL_VERSION,
  decodeClientFrame,
  type AckFrame,
  type CommandFrame,
  type HelloFrame,
  type ServerFrame,
} from '@game/protocol';
import type { WebSocket } from 'ws';
import type { GuestStore } from '../auth/guests.js';
import type { RoomQueries } from '../lobby/queries.js';
import { errorFields, type Logger } from '../logger.js';
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
}

type Phase = 'awaitingHello' | 'authenticating' | 'ready' | 'closed';

const OPEN = 1;

const isMember = (state: GameState, guestId: string): boolean => state.players.some((p) => p.id === guestId);

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

    // Subscribe, read the state and send Welcome in one synchronous step: every
    // later commit arrives as an Update with a higher revision, none is lost.
    this.room = room;
    this.guestId = guest.guestId;
    this.viewer = { kind: 'player', id: guest.guestId as PlayerId };
    this.unsubscribe = room.subscribe((event) => this.onRoomEvent(event));
    const state = room.state;
    this.sentRevision = state.revision;
    this.phase = 'ready';
    this.send({
      t: 'Welcome',
      protocolVersion: PROTOCOL_VERSION,
      playerId: this.viewer.id,
      revision: state.revision,
      view: projectState(state, this.viewer),
    });
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

  // ---- Room events ----------------------------------------------------------

  private onRoomEvent(event: RoomEvent): void {
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
    }
  }

  private update(revision: number, state: GameState, events: readonly GameEvent[]): void {
    if (revision <= this.sentRevision) return;
    this.sentRevision = revision;
    const viewer = this.viewer!;
    this.send({ t: 'Update', revision: state.revision, view: projectState(state, viewer), events: projectEvents(events, viewer) });
    if (!isMember(state, this.guestId!)) {
      this.fail('NOT_A_PARTICIPANT', 'You left this room', CLOSE.normal);
    }
  }

  // ---- Outbound -------------------------------------------------------------

  private send(frame: ServerFrame): void {
    if (this.socket.readyState !== OPEN) return;
    if (this.socket.bufferedAmount > MAX_BUFFERED_BYTES) {
      this.deps.logger.warn('game socket too slow; dropped', { roomId: this.room?.gameId, guestId: this.guestId });
      this.socket.terminate();
      this.cleanup();
      return;
    }
    this.socket.send(JSON.stringify(frame));
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
