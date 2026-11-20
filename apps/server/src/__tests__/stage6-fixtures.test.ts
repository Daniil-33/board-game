import { expect, it } from 'vitest';
import { checkInvariants, CURRENT_RULES_VERSION, entropy, gameEngine, timestamp, type GameCommand, type GameEvent, type GameState } from '@game/game-core';
import { buildFixture, STAGE6_FIXTURE_NAMES } from '../test-fixtures.js';

const NOW = 1767225600000;
const ids = ['g-0', 'g-1', 'g-2'];

function run(state: GameState, type: string, payload: unknown = null): { state: GameState; events: readonly GameEvent[] } {
  const command: GameCommand = { type, payload, commandId: `stage6-${type}-${state.revision}` as never,
    actor: { kind: 'player', id: state.turn!.playerId },
    expected: { kind: 'target', target: { kind: 'turn', id: state.turn!.turnId } } };
  const result = gameEngine.execute(state, command, { now: timestamp(NOW + 1000), entropy: entropy([1, 2, 3, 4]) });
  if (result.kind !== 'accepted') throw new Error(result.error.code);
  checkInvariants(result.state);
  return result;
}

it.each(STAGE6_FIXTURE_NAMES)('%s is a current-rules invariant-safe state for three guests', name => {
  const state = buildFixture(name, ids, NOW);
  checkInvariants(state);
  expect(state.rulesVersion).toBe(CURRENT_RULES_VERSION);
  expect(state.players.map(player => player.id)).toEqual(ids);
});

it('jail-choice pays before a normal roll', () => {
  const jailed = buildFixture('jail-choice', ids, NOW);
  const paid = run(jailed, 'PayJailFee');
  expect(paid.events.some(event => event.type === 'JailReleased')).toBe(true);
  expect(paid.state.jail[jailed.turn!.playerId]).toBeUndefined();
  expect(run(paid.state, 'RollDice').events.some(event => event.type === 'DiceRolled')).toBe(true);
});

it('pre-roll-chance places the active player seven cells before chance', () => {
  const state = buildFixture('pre-roll-chance', ids, NOW);
  const target = state.board!.cells.find(cell => cell.kind === 'chance')!;
  expect((state.positions[state.turn!.playerId]! + 7) % 40).toBe(target.index);
});
