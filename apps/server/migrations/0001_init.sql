-- Stage 1 schema: guests, rooms, membership, the per-game command log and
-- state snapshots. Up only; later migrations alter, never edit this file.

create table guests (
  id text primary key,
  nickname text not null,
  token_hash text not null unique,
  created_at timestamptz not null default now()
);

create table rooms (
  id text primary key,
  creator_id text not null references guests(id),
  status text not null,
  created_at timestamptz not null default now(),
  -- Named so a later migration can drop and re-add it with more statuses.
  constraint rooms_status_check check (status in ('lobby', 'playing'))
);

create table room_members (
  room_id text not null references rooms(id),
  guest_id text not null references guests(id),
  joined_at timestamptz not null default now(),
  primary key (room_id, guest_id)
);

-- One row per accepted command. `entry` is the game-core LogEntry verbatim.
create table game_log (
  game_id text not null references rooms(id),
  revision integer not null,
  command_id text not null,
  entry jsonb not null,
  primary key (game_id, revision),
  constraint game_log_game_id_command_id_key unique (game_id, command_id)
);

-- `state` is the game-core GameState at `revision`.
create table game_snapshots (
  game_id text not null references rooms(id),
  revision integer not null,
  state jsonb not null,
  primary key (game_id, revision)
);
