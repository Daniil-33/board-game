import type { CommandId, GameCommand, GameEngine, GameEvent, GameState, Revision } from '@game/game-core';
import type { ChatRejectReason } from '@game/protocol';
import type { StoredChatMessage, StoredHistory } from '../db/game-store.js';

export type Engine = GameEngine<GameState, GameCommand, GameEvent>;

/** The accepted command could not be written; the room reloaded from the database. */
export const PERSISTENCE_FAILED = 'PERSISTENCE_FAILED';
/** The room is failed or closed, or could not run the command at all. */
export const ROOM_UNAVAILABLE = 'ROOM_UNAVAILABLE';

export type RoomStatus = 'live' | 'failed' | 'closed';

export type RoomResult =
  | {
      readonly kind: 'accepted';
      readonly commandId: CommandId;
      readonly revision: Revision;
      readonly events: readonly GameEvent[];
      /** True when this is the stored result of an earlier delivery; nothing was written. */
      readonly duplicate: boolean;
    }
  | {
      readonly kind: 'rejected';
      readonly commandId: CommandId;
      /** The room's persisted revision when the command was rejected. */
      readonly revision: Revision;
      /** An engine or session code passed through, or `PERSISTENCE_FAILED` / `ROOM_UNAVAILABLE`. */
      readonly error: { readonly code: string; readonly message: string };
    };

export type RoomEvent =
  | {
      readonly kind: 'update';
      readonly commandId: CommandId;
      readonly revision: Revision;
      readonly state: GameState;
      readonly events: readonly GameEvent[];
    }
  /** The room reloaded from the database to a persisted state subscribers have not been given. */
  | { readonly kind: 'resync'; readonly revision: Revision; readonly state: GameState }
  | { readonly kind: 'failed'; readonly reason: string }
  /** The room was closed by a command submitted with `closeRoom`; it follows that command's `update`. */
  | { readonly kind: 'closed' }
  /** A chat message was stored; emitted before its sender is answered. */
  | { readonly kind: 'chat'; readonly message: StoredChatMessage };

export type ChatResult =
  | { readonly ok: true; readonly message: StoredChatMessage }
  | { readonly ok: false; readonly reason: ChatRejectReason };

export type AttachResult =
  | {
      readonly ok: true;
      /** The persisted state the history ends at. */
      readonly state: GameState;
      /** Unprojected: the caller filters events for its viewer. */
      readonly history: StoredHistory;
      readonly unsubscribe: () => void;
    }
  | { readonly ok: false };

export interface SubmitOptions {
  /**
   * When the command is accepted (not a duplicate), set `rooms.status` to
   * `closed` in the same transaction and stop the room: `update`, then
   * `closed`, then every later submit is rejected with `ROOM_UNAVAILABLE`.
   * No effect on a rejected or duplicate command.
   */
  readonly closeRoom?: boolean;
}

export interface Room {
  readonly gameId: string;
  readonly status: RoomStatus;
  /**
   * The last persisted state, unprojected. For a room that failed while
   * loading there is none and this is the genesis state: check `status`.
   */
  readonly state: GameState;
  /**
   * Run one command. The caller sets `actor`; the room adds time and entropy.
   * Resolves in submission order; never throws or rejects.
   */
  submit(command: GameCommand, options?: SubmitOptions): Promise<RoomResult>;
  /** `listener` runs after commit, in revision order. Returns unsubscribe. */
  subscribe(listener: (event: RoomEvent) => void): () => void;
  /**
   * One step of the room's queue: read the recent history up to the
   * persisted state and subscribe `listener`, so every later commit or chat
   * message reaches the listener and none is also in the history. `ok: false`
   * when the room is not live or the history could not be read. Never rejects.
   */
  attach(listener: (event: RoomEvent) => void): Promise<AttachResult>;
  /**
   * Handle one chat message on the room's queue, after the commands queued
   * before it: member, text and rate checks, store, emit `chat`, resolve.
   * Never rejects.
   */
  chat(authorId: string, text: string): Promise<ChatResult>;
}

export interface RoomManager {
  /** Host time used for test fixture deadlines. */
  now(): number;
  /**
   * Boot: load every room with status `lobby` or `playing`. One bad room
   * never throws. `failed` lists rooms whose stored game is bad (registered
   * as failed rooms) and rooms that could not be read (not registered: `open`
   * tries again).
   */
  restoreAll(): Promise<{ restored: string[]; failed: string[] }>;
  /**
   * The live room, loaded from the database on first use (a new room has an
   * empty log). Rejects with `RoomNotFoundError` when no `rooms` row exists
   * and with `RoomManagerClosedError` after `shutdown`.
   */
  open(gameId: string): Promise<Room>;
  get(gameId: string): Room | undefined;
  /** Stop intake, drain every queue, cancel timers, snapshot every live room. Does not close the database. */
  shutdown(): Promise<void>;
}

export class RoomNotFoundError extends Error {
  readonly gameId: string;
  constructor(gameId: string) {
    super(`Room "${gameId}" does not exist`);
    this.name = 'RoomNotFoundError';
    this.gameId = gameId;
  }
}

export class RoomManagerClosedError extends Error {
  readonly code = ROOM_UNAVAILABLE;
  constructor() {
    super('The room manager is shut down');
    this.name = 'RoomManagerClosedError';
  }
}
