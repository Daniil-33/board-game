import { createSession, gameEngine, CURRENT_RULES_VERSION } from '@game/game-core';
import type { GameCommand, CommandId, PlayerId, Timestamp } from '@game/game-core';
import { it, expect } from 'vitest';
import { createServerContext } from '../context/test-context.js';

/** Mirrors the HTTP lobby and manual UI command sequence, including non-roll entropy. */
function fixture(seed: number) {
  const context = createServerContext(seed);
  const session = createSession(gameEngine);
  let sequence = 0;
  const run = (type: string, payload: unknown = null, actor?: string) => {
    const state = session.state;
    const expected = type === 'RollForOrder'
      ? { kind: 'target', target: { kind: 'setupRoll', id: state.setup!.setupRollId } }
      : state.auction
        ? { kind: 'target', target: { kind: 'auctionResponse', id: state.auction.responseId } }
        : type === 'RollDice' || type === 'EndTurn' || type === 'StartAuction'
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
  const setupValues = session.log.flatMap(entry => entry.events)
    .filter(event => event.type === 'OrderDieRolled')
    .map(event => (event.payload as { value: number }).value);
  const dice: Array<{ dice: number[]; events: string[]; player: string }> = [];
  const roll = () => {
    const player = session.state.turn!.playerId;
    const result = run('RollDice', null, player);
    dice.push({
      dice: [...(result.events.find(event => event.type === 'DiceRolled')!.payload as { dice: number[] }).dice],
      events: result.events.map(event => event.type), player,
    });
    return result;
  };
  const closeTurn = () => {
    if (session.state.purchase) run('StartAuction', null, session.state.turn!.playerId);
    while (session.state.auction) run('PassAuction', null, session.state.auction.responder);
    if (session.state.turn?.rolled) run('EndTurn', null, session.state.turn.playerId);
  };
  roll(); closeTurn();
  roll(); closeTurn();
  roll(); closeTurn();
  roll();
  roll(); closeTurn();
  roll();
  return { rolls, setupValues, dice, state: session.state, log: session.log };
}

it('seed 129 repeats setup tie, three doubles, and the first final jail failure through the complete command flow', () => {
  const first = fixture(129);
  expect(first).toEqual(fixture(129));
  expect(first.rolls).toBe(4);
  expect(first.setupValues).toEqual([3, 3, 1, 5]);
  expect(first.dice).toEqual([
    { player: 'b', dice: [2, 1], events: ['DiceRolled', 'PlayerMoved', 'PurchaseOffered'] },
    { player: 'a', dice: [6, 6], events: ['DiceRolled', 'PlayerMoved', 'PurchaseOffered'] },
    { player: 'a', dice: [5, 5], events: ['DiceRolled', 'PlayerMoved', 'ChanceDrawn', 'BalanceChanged'] },
    { player: 'a', dice: [5, 5], events: ['DiceRolled', 'SentToJail', 'TurnEnded', 'TurnStarted'] },
    { player: 'b', dice: [4, 2], events: ['DiceRolled', 'PlayerMoved', 'PurchaseOffered'] },
    { player: 'a', dice: [4, 5], events: ['DiceRolled', 'JailAttemptFailed'] },
  ]);
  expect(first.state.jail).toEqual({ a: { attemptsUsed: 1 } });
});
