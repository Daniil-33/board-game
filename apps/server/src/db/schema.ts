import type { ColumnType } from 'kysely';
import type { GameState, LogEntry, Elimination, PlayerId, Money } from '@game/game-core';

/** Set by the database on insert, never updated. */
type CreatedAt = ColumnType<Date, Date | undefined, never>;

export type RoomStatus = 'lobby' | 'playing' | 'finished' | 'closed';

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
  /** `scrypt$...` hash of the access code; null for an open room. */
  access_code_hash: ColumnType<string | null, string | null | undefined, string | null>;
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

export interface GameResultsTable {
  room_id: string;
  rules_version: string;
  winner_id: string;
  finished_at: Date;
  final_revision: number;
  eliminations: readonly Elimination[];
  final_balances: Readonly<Record<PlayerId, Money>>;
  created_at: CreatedAt;
}

export interface Database {
  game_results: GameResultsTable;
  guests: GuestsTable;
  rooms: RoomsTable;
  room_members: RoomMembersTable;
  game_log: GameLogTable;
  game_snapshots: GameSnapshotsTable;
}
