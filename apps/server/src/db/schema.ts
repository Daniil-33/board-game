import type { ColumnType } from 'kysely';
import type { GameState, LogEntry } from '@game/game-core';

/** Set by the database on insert, never updated. */
type CreatedAt = ColumnType<Date, Date | undefined, never>;

export type RoomStatus = 'lobby' | 'playing';

export interface GuestsTable {
  id: string;
  nickname: string;
  token_hash: string;
  created_at: CreatedAt;
}

export interface RoomsTable {
  id: string;
  creator_id: string;
  status: RoomStatus;
  created_at: CreatedAt;
}

export interface RoomMembersTable {
  room_id: string;
  guest_id: string;
  joined_at: CreatedAt;
}

export interface GameLogTable {
  /** `rooms.id`. */
  game_id: string;
  revision: number;
  command_id: string;
  /** The core `LogEntry`, unchanged. Insert through `jsonb()`. */
  entry: LogEntry;
}

export interface GameSnapshotsTable {
  /** `rooms.id`. */
  game_id: string;
  revision: number;
  /** The core `GameState`, unchanged. Insert through `jsonb()`. */
  state: GameState;
}

export interface Database {
  guests: GuestsTable;
  rooms: RoomsTable;
  room_members: RoomMembersTable;
  game_log: GameLogTable;
  game_snapshots: GameSnapshotsTable;
}
