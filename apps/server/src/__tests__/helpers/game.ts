import type { CommandId, GameCommand, GameState, PlayerId, Revision, TargetRef } from '@game/game-core';
import type { GameRoom } from '../../rooms/room.js';
import type { Room, RoomResult } from '../../rooms/types.js';

/** 2026-01-01T00:00:00Z. */
export const T0 = 1_767_225_600_000;

let counter = 0;
export const cid = (prefix = 'c'): CommandId => `${prefix}-${++counter}` as CommandId;

/** A system lifecycle command expecting `revision`. */
export function sys(type: string, payload: unknown, revision: number, id: string = cid()): GameCommand {
  return {
    type,
    commandId: id as CommandId,
    actor: { kind: 'system' },
    expected: { kind: 'revision', revision: revision as Revision },
    payload,
  };
}

export function byPlayer(type: string, player: string, target: TargetRef, id: string = cid()): GameCommand {
  return {
    type,
    commandId: id as CommandId,
    actor: { kind: 'player', id: player as PlayerId },
    expected: { kind: 'target', target },
    payload: null,
  };
}

export function timeoutFor(target: TargetRef, id: string = cid('manual-timeout')): GameCommand {
  return { type: 'Timeout', commandId: id as CommandId, actor: { kind: 'system' }, expected: { kind: 'target', target }, payload: null };
}

type Accepted = Extract<RoomResult, { kind: 'accepted' }>;

/** Submit and require acceptance. */
export async function ok(room: Room, command: GameCommand): Promise<Accepted> {
  const result = await room.submit(command);
  if (result.kind !== 'accepted') {
    throw new Error(`${command.type} rejected: ${result.error.code} ${result.error.message}`);
  }
  return result;
}

export const createGame = (room: Room, seed = 42) =>
  ok(room, sys('CreateGame', { seed, rulesVersion: 'core-2' }, room.state.revision));
export const addPlayer = (room: Room, id: string) => ok(room, sys('AddPlayer', { playerId: id }, room.state.revision));
export const startGame = (room: Room) => ok(room, sys('StartGame', null, room.state.revision));

/** CreateGame and AddPlayer for each id: phase `lobby`, revision `1 + players.length`. */
export async function lobby(room: Room, players: readonly string[] = ['a', 'b'], seed = 42): Promise<void> {
  await createGame(room, seed);
  for (const id of players) await addPlayer(room, id);
}

/** The command the player to move would send next: order roll, dice roll or end of turn. */
export function nextMove(state: GameState): GameCommand {
  if (state.phase === 'setup' && state.setup !== null) {
    return byPlayer('RollForOrder', state.setup.playerId, { kind: 'setupRoll', id: state.setup.setupRollId });
  }
  if (state.phase === 'playing' && state.turn !== null) {
    const turn = state.turn;
    return byPlayer(turn.rolled ? 'EndTurn' : 'RollDice', turn.playerId, { kind: 'turn', id: turn.turnId });
  }
  throw new Error(`no move in phase ${state.phase}`);
}

export const step = (room: Room) => ok(room, nextMove(room.state));

/** Roll for order until the game is in phase `playing`. */
export async function toPlaying(room: Room): Promise<void> {
  while (room.state.phase === 'setup') await step(room);
  if (room.state.phase !== 'playing') throw new Error(`expected phase playing, got ${room.state.phase}`);
}

/** Lobby, start and order rolls: a game in phase `playing` with nobody having rolled. */
export async function playingGame(room: Room, players: readonly string[] = ['a', 'b'], seed = 42): Promise<void> {
  await lobby(room, players, seed);
  await startGame(room);
  await toPlaying(room);
}

/** Play moves until the room is at `revision` or beyond. */
export async function playTo(room: Room, revision: number): Promise<void> {
  while (room.state.revision < revision) await step(room);
}

/** Wait until every command submitted so far, including timer-issued ones, has finished. */
export const whenIdle = (room: Room): Promise<void> => (room as GameRoom).idle();
