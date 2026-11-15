import { createSession, gameEngine, CURRENT_RULES_VERSION } from '@game/game-core';
import type { GameCommand, CommandId, PlayerId, Timestamp } from '@game/game-core';
import { createServerContext } from '../src/context/test-context.js';

/** Mirrors the HTTP lobby and manual UI command sequence, including non-roll entropy. */
function fixture(seed: number) {
  const context = createServerContext(seed);
  const session = createSession(gameEngine);
  let sequence = 0;
  const run = (type: string, payload: unknown = null, actor?: string) => {
    const state = session.state;
    const expected = type === 'RollForOrder'
      ? { kind: 'target', target: { kind: 'setupRoll', id: state.setup!.setupRollId } }
      : type === 'RollDice' || type === 'EndTurn'
        ? { kind: 'target', target: { kind: 'turn', id: state.turn!.turnId } }
        : { kind: 'revision', revision: state.revision };
    const result = session.submit({
      commandId: `c${++sequence}` as CommandId,
      type, payload,
      actor: actor ? { kind: 'player', id: actor as PlayerId } : { kind: 'system' },
      expected,
    } as GameCommand, { now: 1000 as Timestamp, entropy: context.entropy.next() });
    if (result.kind !== 'accepted') throw Error(`${type}: ${result.error.code}`);
    return result;
  };
  run('CreateGame', { seed: context.gameSeed(), rulesVersion: CURRENT_RULES_VERSION });
  run('AddPlayer', { playerId: 'a' });
  run('AddPlayer', { playerId: 'b' });
  run('StartGame');
  let rolls = 0;
  while (session.state.phase === 'setup' && rolls < 20) {
    run('RollForOrder', null, session.state.setup!.playerId);
    rolls++;
  }
  const dice = [];
  for (let i = 0; i < 3; i++) {
    const result = run('RollDice', null, session.state.turn!.playerId);
    dice.push(result.events.find(event => event.type === 'DiceRolled')!.payload);
    if (Object.keys(session.state.jail).length > 0) break;
    if (!session.state.turn!.pendingBonus) break;
    run('EndTurn', null, session.state.turn!.playerId);
  }
  return { rolls, dice, state: session.state, log: session.log };
}

for (let seed = 0; seed < 100_000; seed++) {
  const result = fixture(seed);
  if (result.rolls > 2 && result.dice.length === 3 && Object.keys(result.state.jail).length > 0) {
    console.log(JSON.stringify({ seed, orderRolls: result.rolls, dice: result.dice }));
    break;
  }
}
