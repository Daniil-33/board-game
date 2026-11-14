import { describe, it, expect } from 'vitest';
import { EVENT_VISIBILITY, projectEvents, UnclassifiedEventError, type Viewer } from '../projection.js';
import { createSession } from '../session.js';
import { gameEngine } from '../lifecycle.js';
import type { GameEvent } from '../engine.js';
import { cmd, ctx, deepFreeze, pid } from './helpers/fixtures.js';

const SPECTATOR: Viewer = { kind: 'spectator' };

function lifecycleEvents(): GameEvent[] {
  const s = createSession(gameEngine);
  const results = [
    s.submit(cmd('CreateGame', { seed: 42, rulesVersion: 'core-1' }, { rev: 0 }), ctx()),
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
    expect(events.map((e) => e.type)).toEqual(['GameCreated', 'PlayerAdded', 'PlayerAdded', 'GameStarted']);
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
