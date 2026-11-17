## ADDED Requirements

### Requirement: Chat storage
Migration `0007` SHALL create `chat_messages(room_id, seq, author_id, text, created_at)` with `room_id` referencing `rooms.id`, `author_id` referencing `guests.id`, a primary key on `(room_id, seq)`, a positive `seq` and text of 1-300 characters. Chat rows SHALL survive restarts and room completion and SHALL NOT be part of `game_log` or `game_snapshots`.

#### Scenario: Seq collision
- **WHEN** a second row with an existing `(room_id, seq)` is inserted
- **THEN** the database SHALL reject it with a unique violation

#### Scenario: Upgrade from 0006
- **WHEN** migration 0007 runs on a database migrated to 0006
- **THEN** it SHALL succeed and keep every existing row
