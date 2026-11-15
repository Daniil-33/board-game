import { randomInt } from 'node:crypto';
import { CURRENT_RULES_VERSION, type CommandId, type GameCommand, type GameState, type Revision } from '@game/game-core';
import type { CreateRoomResponse, RoomSummary } from '@game/protocol';
import type { Kysely } from 'kysely';
import type { Guest } from '../auth/guests.js';
import { newId } from '../auth/tokens.js';
import type { Database } from '../db/schema.js';
import { ApiError, notParticipant, rejection, roomClosed, roomNotFound, roomUnavailable } from '../http/errors.js';
import { errorFields, type Logger } from '../logger.js';
import { RoomNotFoundError, type Room, type RoomManager, type SubmitOptions } from '../rooms/types.js';
import { hashAccessCode, verifyAccessCode } from './access-code.js';
import type { RoomQueries } from './queries.js';

/** Attempts of one lobby operation that lost a revision race to another request. */
export const MAX_ATTEMPTS = 5;

export interface LobbyService {
  create(guest: Guest, accessCode: string | undefined): Promise<CreateRoomResponse>;
  list(guest: Guest): Promise<RoomSummary[]>;
  get(guest: Guest, roomId: string): Promise<RoomSummary>;
  join(guest: Guest, roomId: string, accessCode: string | undefined): Promise<RoomSummary>;
  leave(guest: Guest, roomId: string): Promise<RoomSummary>;
  start(guest: Guest, roomId: string): Promise<RoomSummary>;
}

export interface LobbyDeps {
  readonly db: Kysely<Database>;
  readonly manager: RoomManager;
  readonly queries: RoomQueries;
  readonly logger: Logger;
}

const isMember = (state: GameState, guestId: string): boolean => state.players.some((p) => p.id === guestId);

function systemCommand(type: string, payload: unknown, revision: Revision): GameCommand {
  return {
    type,
    commandId: newId('lobby-') as CommandId,
    actor: { kind: 'system' },
    expected: { kind: 'revision', revision },
    payload,
  };
}

/** Relative invite link; the server does not know the origin the client is served from. */
export function inviteLink(roomId: string, accessCode: string): string {
  return `/?room=${encodeURIComponent(roomId)}&code=${encodeURIComponent(accessCode)}`;
}

export function createLobbyService(deps: LobbyDeps): LobbyService {
  const { db, manager, queries, logger } = deps;

  async function openRoom(roomId: string): Promise<Room> {
    let room: Room;
    try {
      room = await manager.open(roomId);
    } catch (error) {
      if (error instanceof RoomNotFoundError) throw roomNotFound();
      logger.error('room could not be opened', { roomId, ...errorFields(error) });
      throw roomUnavailable();
    }
    if (room.status === 'closed') throw roomClosed();
    if (room.status === 'failed') throw roomUnavailable();
    return room;
  }

  /** The `rooms` row; 404 when unknown, 409 `ROOM_CLOSED` when closed. */
  async function openRow(roomId: string) {
    const row = await queries.findRoom(roomId);
    if (row === null) throw roomNotFound();
    if (row.status === 'closed') throw roomClosed();
    return row;
  }

  async function summaryOf(roomId: string): Promise<RoomSummary> {
    const summary = await queries.summary(roomId);
    if (summary === null) throw roomNotFound();
    return summary;
  }

  /**
   * Submit one system command built from the current committed state. On a
   * lost revision race the preconditions are checked again on the new state
   * and the command is rebuilt, at most `MAX_ATTEMPTS` times.
   * `prepare` returns the command, `null` when there is nothing to do, or throws.
   */
  async function submitSystem(
    room: Room,
    prepare: (state: GameState) => { type: string; payload: unknown; options?: SubmitOptions } | null,
  ): Promise<void> {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      if (room.status === 'closed') throw roomClosed();
      const state = room.state;
      const next = prepare(state);
      if (next === null) return;
      const result = await room.submit(systemCommand(next.type, next.payload, state.revision), next.options);
      if (result.kind === 'accepted') return;
      if (result.error.code === 'REVISION_MISMATCH') continue;
      // The status may have changed while the command was queued.
      if (result.error.code === 'ROOM_UNAVAILABLE' && (room.status as Room['status']) === 'closed') throw roomClosed();
      throw rejection(result.error);
    }
    throw new ApiError(409, 'REVISION_MISMATCH', 'The room kept changing; try again');
  }

  return {
    async create(guest, accessCode) {
      const roomId = newId('r_');
      const accessCodeHash = accessCode === undefined ? null : await hashAccessCode(accessCode);
      await db
        .insertInto('rooms')
        .values({ id: roomId, creator_id: guest.guestId, status: 'lobby', access_code_hash: accessCodeHash })
        .execute();
      try {
        const room = await openRoom(roomId);
        await submitSystem(room, (state) =>
          state.revision === 0
            ? { type: 'CreateGame', payload: { seed: randomInt(0, 2 ** 32), rulesVersion: CURRENT_RULES_VERSION } }
            : null,
        );
        await submitSystem(room, (state) => (isMember(state, guest.guestId) ? null : { type: 'AddPlayer', payload: { playerId: guest.guestId } }));
      } catch (error) {
        // A room without its game or creator must never be listed or joined.
        logger.error('room creation failed', { roomId, ...errorFields(error) });
        await db
          .updateTable('rooms')
          .set({ status: 'closed' })
          .where('id', '=', roomId)
          .execute()
          .catch(() => undefined);
        throw roomUnavailable();
      }
      const room = await summaryOf(roomId);
      return accessCode === undefined ? { room } : { room, accessCode, inviteLink: inviteLink(roomId, accessCode) };
    },

    list(guest) {
      return queries.list(guest.guestId);
    },

    async get(guest, roomId) {
      const summary = await queries.summary(roomId);
      if (summary === null) throw roomNotFound();
      if (!summary.members.some((m) => m.guestId === guest.guestId)) throw notParticipant();
      return summary;
    },

    async join(guest, roomId, accessCode) {
      const row = await openRow(roomId);
      const room = await openRoom(roomId);
      if (isMember(room.state, guest.guestId)) return summaryOf(roomId);
      if (row.accessCodeHash !== null) {
        if (accessCode === undefined) throw new ApiError(403, 'ACCESS_CODE_REQUIRED', 'This room requires an access code');
        if (!(await verifyAccessCode(accessCode, row.accessCodeHash))) {
          throw new ApiError(403, 'ACCESS_CODE_INVALID', 'The access code is wrong');
        }
      }
      // Phase and seats are the core's rules: past the lobby or full is rejected with its code.
      await submitSystem(room, (state) => (isMember(state, guest.guestId) ? null : { type: 'AddPlayer', payload: { playerId: guest.guestId } }));
      return summaryOf(roomId);
    },

    async leave(guest, roomId) {
      const row = await openRow(roomId);
      const room = await openRoom(roomId);
      const closeRoom = row.creatorId === guest.guestId;
      await submitSystem(room, (state) => {
        if (!isMember(state, guest.guestId)) throw notParticipant();
        // After the start the core rejects LeaveLobby (phase); resignation is the socket's `Resign`.
        return { type: 'LeaveLobby', payload: { playerId: guest.guestId }, options: { closeRoom } };
      });
      return summaryOf(roomId);
    },

    async start(guest, roomId) {
      const row = await openRow(roomId);
      if (row.creatorId !== guest.guestId) throw new ApiError(403, 'NOT_ROOM_CREATOR', 'Only the room creator may start the game');
      const room = await openRoom(roomId);
      await submitSystem(room, () => ({ type: 'StartGame', payload: null }));
      return summaryOf(roomId);
    },
  };
}
