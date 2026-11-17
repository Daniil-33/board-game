-- Room chat (protocol v6). Outside the game log, snapshots and replay.
CREATE TABLE chat_messages (
  room_id text NOT NULL REFERENCES rooms(id),
  seq integer NOT NULL CHECK (seq > 0),
  author_id text NOT NULL REFERENCES guests(id),
  text text NOT NULL CHECK (char_length(text) BETWEEN 1 AND 300),
  created_at timestamptz NOT NULL,
  PRIMARY KEY (room_id, seq)
);
