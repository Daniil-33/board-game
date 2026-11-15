-- Stage 1 lobby: game end, room closing and room access codes.

alter table rooms drop constraint rooms_status_check;
alter table rooms add constraint rooms_status_check
  check (status in ('lobby', 'playing', 'finished', 'closed'));

-- Salted slow hash of the creator's access code (never the code itself);
-- null for an open room.
alter table rooms add column access_code_hash text;
