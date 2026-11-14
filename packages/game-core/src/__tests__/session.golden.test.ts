import { describe, it, expect } from 'vitest';
import { createSession, replay, type Session } from '../session.js';
import { gameEngine } from '../rules.js';
import { pendingDeadlines } from '../deadlines.js';
import { canonicalJson } from '../canonical.js';
import { entropy } from '../types.js';
import { cmd, ctx, player } from './helpers/fixtures.js';

/**
 * A fixed 300-command game: lifecycle, then the owner of every pending deadline acts
 * (or the system times out) on a fixed schedule with fixed entropy. Pins a golden
 * summary so any change to transitions or the RNG stream is caught (and needs a
 * rulesVersion bump).
 */
function play(): Session {
  const s = createSession(gameEngine);
  let t = 1_767_225_600_000;
  let i = 0;
  const submit = (c: ReturnType<typeof cmd>, at: number) => {
    i += 1;
    const e = entropy([i, (i * 2654435761) >>> 0, 0x5eed, (i ^ 0xffff) >>> 0]);
    const r = s.submit(c, ctx(at, e));
    if (r.kind !== 'accepted') throw new Error(`command ${i} (${c.type}) rejected: ${r.error.code}`);
    t = Math.max(t, at);
  };
  submit(cmd('CreateGame', { seed: 20261114, rulesVersion: 'core-2' }, { id: 'g0', rev: 0 }), t);
  for (const p of ['a', 'b', 'c', 'd']) submit(cmd('AddPlayer', { playerId: p }, { id: `add-${p}`, rev: s.state.revision }), t);
  submit(cmd('StartGame', null, { id: 'start', rev: s.state.revision }), t);

  while (s.log.length < 300) {
    const [d] = pendingDeadlines(s.state);
    const target = d!.target;
    const id = `k${s.log.length}`;
    // Every fifth command is a Timeout at the deadline; otherwise the owner acts 1 s later.
    if (s.log.length % 5 === 0) {
      submit(cmd('Timeout', null, { id, target }), d!.at);
    } else if (s.state.phase === 'setup') {
      submit(cmd('RollForOrder', null, { id, target, actor: player(s.state.setup!.playerId) }), t + 1_000);
    } else {
      const turn = s.state.turn!;
      const type = turn.rolled ? 'EndTurn' : 'RollDice';
      submit(cmd(type, null, { id, target, actor: player(turn.playerId) }), t + 1_000);
    }
  }
  return s;
}

function summary(s: Session) {
  const events = s.log.flatMap((e) => e.events);
  const count = (type: string) => events.filter((e) => e.type === type).length;
  return {
    revision: s.state.revision,
    order: s.state.order,
    positions: s.state.positions,
    jail: s.state.jail,
    turn: s.state.turn && { playerId: s.state.turn.playerId, turnId: s.state.turn.turnId },
    turnsStarted: count('TurnStarted'),
    bonusTurns: events.filter((e) => e.type === 'TurnStarted' && (e.payload as { bonus: boolean }).bonus).length,
    continuations: count('TurnContinued'),
    jailSends: count('SentToJail'),
    jailReleases: count('InterimJailReleased'),
    eventCount: events.length,
  };
}

describe('seeded multi-turn game', () => {
  it('pins a golden summary of a fixed 300-command game', () => {
    const s = play();
    expect(summary(s)).toMatchInlineSnapshot(`
      {
        "bonusTurns": 19,
        "continuations": 29,
        "eventCount": 626,
        "jail": {},
        "jailReleases": 0,
        "jailSends": 0,
        "order": [
          "c",
          "d",
          "b",
          "a",
        ],
        "positions": {
          "a": 33,
          "b": 18,
          "c": 29,
          "d": 20,
        },
        "revision": 300,
        "turn": {
          "playerId": "c",
          "turnId": "t299",
        },
        "turnsStarted": 144,
      }
    `);
  });

  it('is stable across two runs and replays to the same state', () => {
    const a = play();
    const b = play();
    expect(canonicalJson(a.log)).toBe(canonicalJson(b.log));
    expect(replay(gameEngine, a.log).state).toEqual(a.state);
  });
});
