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
  submit(cmd('CreateGame', { seed: 20261114, rulesVersion: 'core-7' }, { id: 'g0', rev: 0 }), t);
  for (const p of ['a', 'b', 'c', 'd']) submit(cmd('AddPlayer', { playerId: p }, { id: `add-${p}`, rev: s.state.revision }), t);
  submit(cmd('StartGame', null, { id: 'start', rev: s.state.revision }), t);

  while (s.log.length < 300) {
    const [d] = pendingDeadlines(s.state);
    const target = d!.target;
    const id = `k${s.log.length}`;
    // Every fifth command is a Timeout at the deadline; otherwise the owner acts 1 s later.
    if (s.log.length % 5 === 0) {
      submit(cmd('Timeout', null, { id, target }), d!.at);
    } else if (s.state.auction !== null) {
      submit(cmd(s.log.length % 3 === 0 ? 'Bid' : 'PassAuction', null, { id, target, actor: player(s.state.auction.responder) }), t + 1_000);
    } else if (s.state.phase === 'setup') {
      submit(cmd('RollForOrder', null, { id, target, actor: player(s.state.setup!.playerId) }), t + 1_000);
    } else {
      const turn = s.state.turn!;
      const type = s.state.purchase !== null ? (s.log.length % 2 === 0 ? 'BuyAsset' : 'StartAuction') : turn.rolled ? 'EndTurn' : 'RollDice';
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
    boardAssets: s.state.board!.cells.filter(c => c.asset).map(c => c.asset!.assetId),
    balances: s.state.balances,
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
        "balances": {
          "a": 19710,
          "b": 12330,
          "c": 7220,
          "d": 10260,
        },
        "boardAssets": [
          "fuel-3",
          "fuel-2",
          "logistics-5",
          "mobility-4",
          "mobility-1",
          "mobility-3",
          "insurance-4",
          "energy-1",
          "insurance-2",
          "insurance-6",
          "logistics-1",
          "commerce-6",
          "commerce-5",
          "commerce-1",
          "groceries-2",
          "groceries-5",
          "groceries-1",
          "logistics-6",
          "telecom-3",
          "telecom-2",
          "energy-3",
          "telecom-1",
          "banks-1",
          "banks-6",
          "banks-8",
          "logistics-4",
          "technology-1",
          "technology-3",
        ],
        "bonusTurns": 20,
        "continuations": 22,
        "eventCount": 780,
        "jail": {},
        "jailReleases": 0,
        "jailSends": 0,
        "order": [
          "d",
          "c",
          "b",
          "a",
        ],
        "positions": {
          "a": 10,
          "b": 35,
          "c": 38,
          "d": 31,
        },
        "revision": 300,
        "turn": {
          "playerId": "b",
          "turnId": "t299",
        },
        "turnsStarted": 95,
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
