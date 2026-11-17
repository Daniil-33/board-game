-- Stage 4 states are incompatible with core-7; retain their history.
UPDATE rooms SET status = 'closed' WHERE status IN ('lobby', 'playing');

CREATE TABLE game_results (
  room_id text PRIMARY KEY REFERENCES rooms(id),
  rules_version text NOT NULL,
  winner_id text NOT NULL,
  finished_at timestamptz NOT NULL,
  final_revision integer NOT NULL,
  eliminations jsonb NOT NULL,
  final_balances jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
