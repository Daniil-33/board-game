import { MAX_PLAYERS } from '@game/game-core';
import type { RoomSummary } from '@game/protocol';
import type { Kysely } from 'kysely';
import type { Database, RoomStatus } from '../db/schema.js';

export interface RoomRow {
  readonly id: string;
  readonly creatorId: string;
  readonly status: RoomStatus;
  readonly accessCodeHash: string | null;
}

export interface RoomQueries {
  findRoom(roomId: string): Promise<RoomRow | null>;
  isMember(roomId: string, guestId: string): Promise<boolean>;
  /** The summary of one room, or null when it does not exist. */
  summary(roomId: string): Promise<RoomSummary | null>;
  /**
   * Rooms in `lobby` or `playing` with at least one member, plus `finished`
   * rooms `guestId` is a member of; never `closed`. Newest first.
   */
  list(guestId: string): Promise<RoomSummary[]>;
}

interface SummaryRow {
  id: string;
  creator_id: string;
  status: RoomStatus;
  access_code_hash: string | null;
}

export function createRoomQueries(db: Kysely<Database>): RoomQueries {
  /** Members of each room, in join order, with their nicknames. */
  async function membersOf(roomIds: readonly string[]): Promise<Map<string, RoomSummary['members']>> {
    const byRoom = new Map<string, RoomSummary['members']>(roomIds.map((id) => [id, []]));
    if (roomIds.length === 0) return byRoom;
    const rows = await db
      .selectFrom('room_members')
      .innerJoin('guests', 'guests.id', 'room_members.guest_id')
      .select(['room_members.room_id', 'guests.id', 'guests.nickname'])
      .where('room_members.room_id', 'in', [...roomIds])
      .orderBy('room_members.joined_at')
      .orderBy('guests.id')
      .execute();
    for (const row of rows) byRoom.get(row.room_id)?.push({ guestId: row.id, nickname: row.nickname });
    return byRoom;
  }

  function toSummary(row: SummaryRow, members: RoomSummary['members']): RoomSummary {
    const locked = row.access_code_hash !== null;
    return {
      roomId: row.id,
      creatorId: row.creator_id,
      status: row.status,
      locked,
      joinable: row.status === 'lobby' && !locked && members.length < MAX_PLAYERS,
      members,
    };
  }

  return {
    async findRoom(roomId) {
      const row = await db
        .selectFrom('rooms')
        .select(['id', 'creator_id', 'status', 'access_code_hash'])
        .where('id', '=', roomId)
        .executeTakeFirst();
      return row === undefined
        ? null
        : { id: row.id, creatorId: row.creator_id, status: row.status, accessCodeHash: row.access_code_hash };
    },

    async isMember(roomId, guestId) {
      const row = await db
        .selectFrom('room_members')
        .select('guest_id')
        .where('room_id', '=', roomId)
        .where('guest_id', '=', guestId)
        .executeTakeFirst();
      return row !== undefined;
    },

    async summary(roomId) {
      const row = await db
        .selectFrom('rooms')
        .select(['id', 'creator_id', 'status', 'access_code_hash'])
        .where('id', '=', roomId)
        .executeTakeFirst();
      if (row === undefined) return null;
      return toSummary(row, (await membersOf([row.id])).get(row.id) ?? []);
    },

    async list(guestId) {
      const rows = await db
        .selectFrom('rooms')
        .select(['id', 'creator_id', 'status', 'access_code_hash'])
        .where((eb) =>
          eb.and([
            eb.exists(eb.selectFrom('room_members as m').select('m.guest_id').whereRef('m.room_id', '=', 'rooms.id')),
            eb.or([
              eb('status', 'in', ['lobby', 'playing']),
              eb.and([
                eb('status', '=', 'finished'),
                eb.exists(
                  eb
                    .selectFrom('room_members as own')
                    .select('own.guest_id')
                    .whereRef('own.room_id', '=', 'rooms.id')
                    .where('own.guest_id', '=', guestId),
                ),
              ]),
            ]),
          ]),
        )
        .orderBy('created_at', 'desc')
        .orderBy('id')
        .execute();
      const members = await membersOf(rows.map((r) => r.id));
      return rows.map((row) => toSummary(row, members.get(row.id) ?? []));
    },
  };
}
