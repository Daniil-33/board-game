# Spec Delta

## Purpose

Adds room closing to the room executor.

## ADDED Requirements

### Requirement: Closing a room
`Room.submit(command, { closeRoom: true })` SHALL, when the command is
accepted and not a duplicate, set `rooms.status` to `closed` in the
transaction of its log entry, emit the `update` and then a `closed` event,
and reject every later command with `ROOM_UNAVAILABLE`. On a rejected or
duplicate command the option SHALL have no effect.

#### Scenario: Close on accept
- **WHEN** an accepted command is submitted with `closeRoom`
- **THEN** subscribers SHALL get `update` then `closed`, `rooms.status` SHALL be `closed`, and the next submit SHALL be rejected with `ROOM_UNAVAILABLE`

#### Scenario: Close on reject
- **WHEN** a command the core rejects is submitted with `closeRoom`
- **THEN** the room SHALL stay live and `rooms.status` SHALL be unchanged
