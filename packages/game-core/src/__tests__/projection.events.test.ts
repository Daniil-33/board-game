import { describe, it, expect } from 'vitest';
import { EVENT_VISIBILITY, projectEvents, UnclassifiedEventError, type Viewer } from '../projection.js';
import { createSession } from '../session.js';
import { gameEngine } from '../rules.js';
import type { GameEvent } from '../engine.js';
import { cmd, ctx, deepFreeze, pid } from './helpers/fixtures.js';
import { setupGame } from './helpers/game.js';
import { CURRENT_RULES_VERSION } from '../lifecycle.js';

const SPECTATOR: Viewer = { kind: 'spectator' };

function lifecycleEvents(): GameEvent[] {
  const s = createSession(gameEngine);
  const results = [
    s.submit(cmd('CreateGame', { seed: 42, rulesVersion: CURRENT_RULES_VERSION }, { rev: 0 }), ctx()),
    s.submit(cmd('AddPlayer', { playerId: 'a' }, { rev: 1 }), ctx()),
    s.submit(cmd('AddPlayer', { playerId: 'b' }, { rev: 2 }), ctx()),
    s.submit(cmd('StartGame', null, { rev: 3 }), ctx()),
  ];
  for (const r of results) expect(r.kind).toBe('accepted');
  return results.flatMap((r) => r.events);
}

describe('projectEvents', () => {
  it('passes every lifecycle event to a spectator unchanged and in order', () => {
    const events = deepFreeze(lifecycleEvents());
    expect(events.map((e) => e.type)).toEqual(['GameCreated', 'BoardGenerated', 'PlayerAdded', 'PlayerAdded', 'GameStarted', 'BalanceChanged', 'BalanceChanged', 'OrderRollStarted']);
    expect(projectEvents(events, SPECTATOR)).toEqual(events);
    expect(projectEvents(events, { kind: 'player', id: pid('a') })).toEqual(events);
  });

  it('fails closed on an unclassified event type', () => {
    const events: GameEvent[] = [{ type: 'GameCreated', payload: {} }, { type: 'Unknown', payload: {} }];
    expect(() => projectEvents(events, SPECTATOR)).toThrow(UnclassifiedEventError);
    expect(() => projectEvents(events, SPECTATOR)).toThrow(/"Unknown"/);
  });

  it('does not treat inherited object keys as classified', () => {
    expect(() => projectEvents([{ type: 'toString', payload: null }], SPECTATOR)).toThrow(UnclassifiedEventError);
  });

  it('classifies every event type the lifecycle registry produces', () => {
    for (const e of lifecycleEvents()) expect(Object.hasOwn(EVENT_VISIBILITY, e.type)).toBe(true);
  });
});

// spec: engine/projection "Event projection fails closed" — Turn events are public.
describe('projectEvents over order-roll, turn and interim-jail events', () => {
  function seededGameEvents(): GameEvent[][] {
    const g = setupGame(['a', 'b', 'c']);
    g.rollForOrder(5);
    g.rollForOrder(2);
    g.rollForOrder(5); // tie a/c
    g.rollForOrder(6);
    g.rollForOrder(1); // order c, a, b
    // c: three doubles -> jail; a, b plain; c fails once; a times out; b plain; c released.
    g.roll(1, 1);
    g.endTurn();
    g.roll(2, 2);
    g.endTurn();
    g.roll(3, 3);
    g.roll(1, 2);
    g.endTurn();
    g.roll(2, 5);
    g.endTurn();
    g.roll(1, 2);
    g.endTurn();
    g.timeout({ dice: [1, 2] }); // a: automatic roll, continuation
    g.timeout(); // a: closes
    g.roll(1, 2); // b
    g.endTurn();
    g.roll(4, 4); // c: release by a double
    g.endTurn();
    return g.session.log.map((e) => e.events as GameEvent[]);
  }

  it('every list projects deep-equal for spectators and players, and every type is classified', () => {
    const lists = seededGameEvents();
    const seen = new Set(lists.flat().map((e) => e.type));
    for (const t of [
      'OrderRollStarted', 'OrderDieRolled', 'OrderTied', 'TurnOrderDetermined', 'TurnStarted', 'DiceRolled',
      'PlayerMoved', 'TurnContinued', 'TurnEnded', 'SentToJail', 'InterimJailAttemptFailed', 'InterimJailReleased',
    ]) {
      expect(seen.has(t), t).toBe(true);
    }
    for (const events of lists) {
      const frozen = deepFreeze(events);
      expect(projectEvents(frozen, SPECTATOR)).toEqual(frozen);
      expect(projectEvents(frozen, { kind: 'player', id: pid('a') })).toEqual(frozen);
    }
  });
});
