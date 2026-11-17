import type { CommandId, GameEvent, Revision, StateView } from '@game/game-core';
import {
  PROTOCOL_VERSION,
  decodeServerFrame,
  type AckFrame,
  type ClientCommandType,
  type CommandFrame,
  type ErrorFrame,
  type HelloFrame,
  type ServerFrame,
} from '@game/protocol';
import { commandExpectation, type Intent, type IntentRequest } from './intent';
import { MAX_MESSAGES, type ConnectionState } from './state';
import type { SocketFactory, SocketLike } from './socket';

/**
 * Reconnect delays; the last one repeats. For the first 20 s after a drop no
 * two attempts are more than 1 s apart (0.5 s, then 1 s up to 19.5 s), so a
 * server restart is noticed within about a second of the server being back,
 * well inside a 10 s response window. Then the backoff grows to 2 s and 5 s.
 */
export const RECONNECT_DELAYS_MS = [
  500,
  1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000,
  1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000,
  2000, 5000,
] as const;

export interface Timers {
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface ConnectionOptions {
  /** Reactive game state this connection writes; nothing else writes it. */
  readonly state: ConnectionState;
  readonly url: string;
  readonly socketFactory: SocketFactory;
  /** The stored guest token at the time of each `Hello`. */
  readonly token: () => string | null;
  readonly newCommandId?: () => string;
  readonly timers?: Timers;
  /** A `Welcome` replaced the view. */
  readonly onWelcome?: (view: StateView) => void;
  /** An `Update` replaced the view; `events` are its events in order. */
  readonly onUpdate?: (view: StateView, events: readonly GameEvent[]) => void;
  /** The server rejected the token. The connection has already stopped. */
  readonly onAuthLost?: () => void;
  /** The room is gone or we are not in it. The connection has already stopped. */
  readonly onRoomLost?: (error: ErrorFrame) => void;
}

export interface Connection {
  /** Connect to a room and stay connected (reconnecting) until `disconnect`. */
  connect(roomId: string): void;
  /** Leave the room: close the socket and drop the view and pending commands. */
  disconnect(): void;
  /**
   * Send an intent: a null-payload type by name, or a type with its protocol
   * payload. Returns false when the view has no target for it or one is already pending.
   */
  sendCommand(request: IntentRequest): boolean;
  dismissMessage(id: number): void;
}

const defaultTimers: Timers = {
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * One WebSocket per joined room. Every received message goes through
 * `decodeServerFrame`; the only frames sent are `Hello` and `Command`.
 */
export function createConnection(options: ConnectionOptions): Connection {
  const { state } = options;
  const timers = options.timers ?? defaultTimers;
  const newCommandId = options.newCommandId ?? (() => crypto.randomUUID());

  let roomId: string | null = null;
  let socket: SocketLike | null = null;
  /** Bumped whenever the current socket is abandoned, so its late callbacks are ignored. */
  let generation = 0;
  let attempt = 0;
  let retryTimer: unknown = null;
  let nextMessageId = 1;
  /** Revision of the held view, from the frame's checked `revision` field (the view itself is an open object). */
  let heldRevision: Revision | null = null;

  function send(frame: HelloFrame | CommandFrame): void {
    socket?.send(JSON.stringify(frame));
  }

  function showMessage(code: string, message: string, commandType?: ClientCommandType): void {
    state.messages.push({ id: nextMessageId++, code, message, ...(commandType !== undefined && { commandType }) });
    if (state.messages.length > MAX_MESSAGES) state.messages.splice(0, state.messages.length - MAX_MESSAGES);
  }

  /** Abandon the current socket and any scheduled retry. */
  function stop(): void {
    generation++;
    if (retryTimer !== null) {
      timers.clearTimeout(retryTimer);
      retryTimer = null;
    }
    const old = socket;
    socket = null;
    state.connected = false;
    old?.close();
  }

  function open(): void {
    retryTimer = null;
    const token = options.token();
    const gameId = roomId;
    if (token === null || gameId === null) return;
    const mine = ++generation;
    socket = options.socketFactory(options.url, {
      onOpen() {
        if (mine !== generation) return;
        send({
          t: 'Hello',
          protocolVersion: PROTOCOL_VERSION,
          token,
          gameId,
          lastRevision: heldRevision,
        });
      },
      onMessage(data) {
        if (mine !== generation) return;
        const decoded = decodeServerFrame(data);
        if (!decoded.ok) {
          // Dropped, never applied.
          state.problem = `Unreadable message from the server: ${decoded.error.message}`;
          console.warn('[connection] dropped frame:', decoded.error.message);
          return;
        }
        handle(decoded.frame);
      },
      onClose() {
        if (mine !== generation) return;
        socket = null;
        state.connected = false;
        scheduleReconnect();
      },
    });
  }

  function scheduleReconnect(): void {
    if (roomId === null || state.fatal !== null || retryTimer !== null) return;
    const delay = RECONNECT_DELAYS_MS[Math.min(attempt, RECONNECT_DELAYS_MS.length - 1)]!;
    attempt++;
    retryTimer = timers.setTimeout(open, delay);
  }

  function handle(frame: ServerFrame): void {
    switch (frame.t) {
      case 'Welcome': {
        state.playerId = frame.playerId;
        heldRevision = frame.revision;
        state.view = frame.view;
        state.connected = true;
        state.problem = null;
        attempt = 0;
        options.onWelcome?.(frame.view);
        // Resend what was never acknowledged, unchanged: same commandId, same expectation.
        for (const command of state.pending) send(command);
        return;
      }
      case 'Update': {
        // Before the first Welcome there is no view to update.
        if (state.view === null || heldRevision === null || frame.revision <= heldRevision) return;
        heldRevision = frame.revision;
        state.view = frame.view;
        options.onUpdate?.(frame.view, frame.events);
        return;
      }
      case 'Ack':
        return handleAck(frame);
      case 'Error':
        return handleError(frame);
    }
  }

  function handleAck(frame: AckFrame): void {
    const index = state.pending.findIndex((c) => c.commandId === frame.commandId);
    if (index < 0) return;
    const [command] = state.pending.splice(index, 1);
    // An accepted Ack changes nothing by itself; the Update carries the result.
    if (frame.outcome === 'rejected') showMessage(frame.error.code, frame.error.message, command!.type);
  }

  function handleError(frame: ErrorFrame): void {
    switch (frame.code) {
      case 'UNAUTHENTICATED':
        disconnect();
        options.onAuthLost?.();
        return;
      case 'NOT_A_PARTICIPANT':
      case 'ROOM_UNAVAILABLE':
      case 'ROOM_CLOSED':
        disconnect();
        options.onRoomLost?.(frame);
        return;
      case 'CONNECTION_REPLACED':
        state.fatal = 'This room is open in another tab.';
        state.pending.splice(0);
        stop();
        return;
      case 'PROTOCOL_VERSION_UNSUPPORTED':
        state.fatal = 'This page is out of date. Reload it to continue.';
        stop();
        return;
      default:
        console.warn('[connection] server error:', frame.code, frame.message);
        showMessage(frame.code, frame.message);
    }
  }

  function disconnect(): void {
    roomId = null;
    stop();
    attempt = 0;
    state.playerId = null;
    heldRevision = null;
    state.view = null;
    state.pending.splice(0);
    state.problem = null;
  }

  return {
    connect(nextRoomId) {
      if (roomId === nextRoomId && (socket !== null || retryTimer !== null)) return;
      disconnect();
      state.fatal = null;
      state.messages.splice(0);
      roomId = nextRoomId;
      open();
    },
    disconnect,
    sendCommand(request) {
      const intent: Intent = typeof request === 'string' ? { type: request, payload: null } : request;
      const type: ClientCommandType = intent.type;
      if (state.pending.some((c) => c.type === type)) return false;
      if (state.playerId !== null && state.view?.eliminated.includes(state.playerId)) return false;
      if (type === 'Resign' && (!state.connected || state.view === null || state.playerId === null ||
          !state.view.players.some((p) => p.id === state.playerId) || state.view.eliminated.includes(state.playerId) ||
          !['setup', 'playing'].includes(state.view.phase))) return false;
      const expected = type === 'Resign'
        ? (heldRevision === null ? null : { kind: 'revision' as const, revision: heldRevision })
        : commandExpectation(state.view, type);
      if (expected === null) return false;
      // Intent only: no actor, no outcome. The server sets the actor from the session.
      const frame: CommandFrame = {
        t: 'Command',
        commandId: newCommandId() as CommandId,
        expected,
        ...intent,
      };
      state.pending.push(frame);
      if (state.connected) send(frame);
      return true;
    },
    dismissMessage(id) {
      const index = state.messages.findIndex((m) => m.id === id);
      if (index >= 0) state.messages.splice(index, 1);
    },
  };
}
