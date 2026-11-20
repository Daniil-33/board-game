import { describe, it, expect } from 'vitest';
import { createSession, replay, restoreSession } from '../session.js';
import { gameEngine } from '../rules.js';
import { seedRng, nextIntInclusive, type RngState } from '../rng.js';
import type { GameCommand, TargetRef } from '../engine.js';
import { entropy, type Entropy } from '../types.js';
import { genesis, type GameState } from '../state.js';
import { projectState } from '../projection.js';
import { pendingDeadlines } from '../deadlines.js';
import { cmd, ctx, player } from './helpers/fixtures.js';
import { CURRENT_RULES_VERSION } from '../lifecycle.js';

// Deterministic generator for the test itself (fixed test seed, no Math.random).
class Gen {
  constructor(private rng: RngState) {}
  int(lo: number, hi: number): number {
    const [v, next] = nextIntInclusive(this.rng, lo, hi);
    this.rng = next;
    return v;
  }
  pick<T>(xs: readonly T[]): T {
    return xs[this.int(0, xs.length - 1)]!;
  }
}

const PLAYER_IDS = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];

/** Targets seen so far in a run, so stale targets can be replayed. */
type Seen = TargetRef[];

function randomExpectation(g: Gen, state: GameState, seen: Seen): unknown {
  const current = pendingDeadlines(state).map((d) => d.target);
  const roll = g.int(0, 19);
  if (roll < 12 && current.length > 0) return { kind: 'target', target: current[0] };
  if (roll < 15 && seen.length > 0) return { kind: 'target', target: g.pick(seen) }; // stale (or current)
  if (roll === 15 && current.length > 0) {
    const t = current[0]!;
    return { kind: 'target', target: { kind: t.kind === 'turn' ? 'setupRoll' : 'turn', id: t.id } }; // wrong kind
  }
  if (roll === 16) return { kind: 'revision', revision: state.revision }; // wrong expectation kind
  if (roll === 17) return g.pick([null, { kind: 'target' }, { kind: 'target', target: 'turn' }, 3]); // malformed
  return { kind: 'target', target: { kind: g.pick(['turn', 'setupRoll']), id: `x${g.int(0, 99)}` } };
}

/** Mostly the current turn or roll owner; sometimes another member, a stranger, or the system. */
function randomActor(g: Gen, state: GameState): GameCommand['actor'] {
  const owner = state.auction?.responder ?? state.turn?.playerId ?? state.setup?.playerId;
  const roll = g.int(0, 19);
  if (owner !== undefined && roll < 15) return player(owner);
  if (roll < 18 && state.players.length > 0) return player(g.pick(state.players).id);
  if (roll === 18) return player('stranger');
  return { kind: 'system' };
}

function lifecycleCommand(g: Gen, state: GameState, history: GameCommand[], seq: number): GameCommand {
  const expRoll = g.int(0, 19);
  const rev = state.revision;
  const expected: unknown =
    expRoll === 0
      ? { kind: 'revision', revision: Math.max(0, rev - 1) }
      : expRoll === 1
        ? { kind: 'revision', revision: rev + 1 }
        : expRoll === 2
          ? { kind: 'target', target: { kind: 'turn', id: `t${g.int(0, 3)}` } }
          : expRoll === 3
            ? g.pick([null, { kind: 'revision' }, { kind: 'revision', revision: String(rev) }, rev])
            : { kind: 'revision', revision: rev };
  const actor = g.int(0, 9) === 0 ? player(g.pick(PLAYER_IDS)) : undefined;
  const id = `c${seq}`;
  const opts = actor ? { id, expected, actor } : { id, expected };

  const phase = state.phase;
  const choice =
    phase === 'uninitialized' ? g.pick([0, 0, 0, 1, 4]) : phase === 'lobby' ? g.pick([1, 1, 1, 2, 2, 3, 4, 0]) : g.int(0, 4);
  switch (choice) {
    case 0:
      return cmd('CreateGame', { seed: g.int(0, 2 ** 32 - 1), rulesVersion: g.int(0, 9) === 0 ? 'core-1' : CURRENT_RULES_VERSION }, opts);
    case 1:
      return cmd('AddPlayer', { playerId: g.pick(PLAYER_IDS) }, opts);
    case 2:
      return cmd('StartGame', null, opts);
    case 3:
      return cmd('AddPlayer', { playerId: g.int(0, 1) === 0 ? '' : 42 }, opts); // malformed
    default:
      return history.length > 0 && g.int(0, 1) === 0 ? cmd('Unknown', null, opts) : cmd('StartGame', null, opts);
  }
}

function gameCommand(g: Gen, state: GameState, seen: Seen, seq: number): GameCommand {
  const id = `c${seq}`;
  const expected = randomExpectation(g, state, seen);
  const payload = g.int(0, 29) === 0 ? { extra: true } : null;
  const roll = g.int(0, 99);
  if (roll < 25) return cmd('Timeout', payload, { id, expected, actor: g.int(0, 19) === 0 ? player('a') : { kind: 'system' } });
  const type = state.auction !== null ? g.pick(['Bid', 'Bid', 'PassAuction']) : state.purchase !== null ? g.pick(['BuyAsset', 'StartAuction', 'EndTurn']) : state.phase === 'setup' ? (roll < 85 ? 'RollForOrder' : g.pick(['RollDice', 'EndTurn'])) : roll < 60 ? 'RollDice' : roll < 95 ? 'EndTurn' : 'RollForOrder';
  return cmd(type, payload, { id, expected, actor: randomActor(g, state) });
}

function randomCommand(g: Gen, state: GameState, history: GameCommand[], seen: Seen, seq: number, allowResignation: boolean): GameCommand {
  const roll = g.int(0, 99);
  // ~6%: resend an earlier command verbatim (duplicate delivery).
  if (roll < 6 && history.length > 0) return g.pick(history);
  // ~3%: reuse an earlier id with a different command (conflict).
  if (roll < 9 && history.length > 0) {
    const prior = g.pick(history);
    return cmd('AddPlayer', { playerId: `conflict-${seq}` }, { id: prior.commandId, rev: state.revision });
  }
  if (allowResignation && roll >= 90) {
    if (state.phase === 'lobby') return cmd('LeaveLobby', { playerId: g.pick(PLAYER_IDS) }, { id: `c${seq}`, rev: state.revision });
    const active = state.players.filter((p) => !state.eliminated.includes(p.id));
    if (active.length > 0) return cmd('Resign', null, { id: `c${seq}`, rev: state.revision, actor: player(g.pick(active).id) });
  }
  if (state.phase === 'finished') return gameCommand(g, state, seen, seq);
  if (state.phase === 'setup' || state.phase === 'playing') {
    // ~5%: a lifecycle command in a game phase.
    return roll < 14 ? lifecycleCommand(g, state, history, seq) : gameCommand(g, state, seen, seq);
  }
  return lifecycleCommand(g, state, history, seq);
}

/** A time around the pending deadline: before, exactly at the boundaries, or well after. */
function randomTime(g: Gen, t: number, state: GameState): number {
  const [d] = pendingDeadlines(state);
  if (d === undefined) return t + g.int(0, 5_000);
  switch (g.int(0, 9)) {
    case 0:
      return d.at - 1;
    case 1:
      return d.at;
    case 2:
      return d.at + 1;
    case 3:
      return d.at + g.int(0, 60_000);
    default:
      return Math.min(t + g.int(0, 8_000), d.at + 5_000);
  }
}

describe('property: any command sequence replays and restores to the identical session', () => {
  const g = new Gen(seedRng(20261116));
  const stats = {
    purchases: 0, auctions: 0, bids: 0, passes: 0, wins: 0, unsold: 0,
    leaves: 0,
    resignations: 0,
    setupVictories: 0,
    playingVictories: 0,
    finishedRejections: 0,
    reachedSetup: 0,
    reachedPlaying: 0,
    accepted: 0,
    duplicates: 0,
    conflicts: 0,
    rejected: 0,
    revisionMismatch: 0,
    targetMismatch: 0,
    notActive: 0,
    deadlinePassed: 0,
    deadlineNotReached: 0,
    continuations: 0,
    bonusTurns: 0,
    jailSends: 0,
    releasedByDouble: 0,
    releasedByForcedFee: 0,
  };

  for (let run = 0; run < 400; run++) {
    const length = g.int(1, 400);
    const commands: GameCommand[] = [];
    const times: number[] = [];
    const entropies: Entropy[] = [];
    const seen: Seen = [];
    /** Live state after each accepted log entry, indexed by revision. */
    const states: GameState[] = [genesis()];

    // Generate the sequence up front against a live session so targets and times are realistic.
    const live = createSession(gameEngine);
    let t = 1_767_225_600_000;
    for (let i = 0; i < length; i++) {
      const c = randomCommand(g, live.state, commands, seen, i, run >= 200);
      const phaseBefore = live.state.phase;
      const at = randomTime(g, t, live.state);
      const e = entropy([g.int(0, 2 ** 32 - 1), g.int(0, 2 ** 32 - 1), g.int(0, 2 ** 32 - 1), g.int(0, 2 ** 32 - 1)]);
      commands.push(c);
      times.push(at);
      entropies.push(e);
      for (const d of pendingDeadlines(live.state)) if (!seen.some((s) => s.id === d.target.id)) seen.push(d.target);
      const logBefore = live.log.length;
      const r = live.submit(c, ctx(at, e)); // must never throw (no invariant violations)
      if (r.kind === 'accepted') {
        if (live.log.length === logBefore) {
          stats.duplicates += 1;
          continue;
        }
        stats.accepted += 1;
        if (c.type === 'LeaveLobby') stats.leaves += 1;
        if (c.type === 'Resign') stats.resignations += 1;
        if (live.state.phase === 'finished') {
          if (phaseBefore === 'setup') stats.setupVictories += 1;
          if (phaseBefore === 'playing') stats.playingVictories += 1;
        }
        t = Math.max(t, at);
        states.push(live.state);
        for (const ev of r.events) {
          const p = ev.payload as Record<string, unknown>;
          if (ev.type === 'AssetPurchased') stats.purchases++;
          if (ev.type === 'AuctionStarted') stats.auctions++;
          if (ev.type === 'AuctionBid') stats.bids++;
          if (ev.type === 'AuctionPassed') stats.passes++;
          if (ev.type === 'AuctionWon') stats.wins++;
          if (ev.type === 'AuctionEndedUnsold') stats.unsold++;
          if (ev.type === 'TurnOrderDetermined') stats.reachedPlaying += 1;
          if (ev.type === 'TurnContinued') stats.continuations += 1;
          if (ev.type === 'TurnStarted' && p['bonus'] === true) stats.bonusTurns += 1;
          if (ev.type === 'SentToJail') stats.jailSends += 1;
          if (ev.type === 'JailReleased') {
            if (p['reason'] === 'double') stats.releasedByDouble += 1;
            if (p['reason'] === 'fee-forced') stats.releasedByForcedFee += 1;
          }
        }
      } else {
        if (phaseBefore === 'finished') stats.finishedRejections += 1;
        const code = r.error.code;
        if (code === 'COMMAND_ID_CONFLICT') stats.conflicts += 1;
        else {
          stats.rejected += 1;
          if (code === 'REVISION_MISMATCH') stats.revisionMismatch += 1;
          if (code === 'TARGET_MISMATCH') stats.targetMismatch += 1;
          if (code === 'NOT_ACTIVE_PLAYER') stats.notActive += 1;
          if (code === 'DEADLINE_PASSED') stats.deadlinePassed += 1;
          if (code === 'DEADLINE_NOT_REACHED') stats.deadlineNotReached += 1;
        }
      }
    }
    if (states.some((s) => s.phase === 'setup')) stats.reachedSetup += 1;
    const split = g.int(0, live.log.length);

    it(`run ${run}: ${length} commands, restore at ${split}`, () => {
      const s = createSession(gameEngine);
      commands.forEach((c, i) => s.submit(c, ctx(times[i], entropies[i])));

      expect(s.state).toEqual(live.state);
      expect(s.state.revision).toBe(s.log.length);

      const replayed = replay(gameEngine, s.log);
      expect(replayed.state).toEqual(s.state);
      expect(replayed.state.rng).toEqual(s.state.rng);
      expect(replayed.log.map((e) => e.events)).toEqual(s.log.map((e) => e.events));

      expect(states[split]!.revision).toBe(split);
      const restored = restoreSession(gameEngine, states[split]!, s.log.slice(split));
      expect(restored.state).toEqual(s.state);
      expect(pendingDeadlines(restored.state)).toEqual(pendingDeadlines(s.state));

      const view = projectState(s.state, { kind: 'spectator' });
      expect(view).not.toHaveProperty('rng');
    });
  }

  it('generator covers the interesting paths', () => {
    for (const value of [stats.purchases, stats.auctions, stats.bids, stats.passes, stats.wins, stats.unsold]) expect(value).toBeGreaterThan(0);
    expect(stats.leaves).toBeGreaterThan(0);
    expect(stats.resignations).toBeGreaterThan(0);
    expect(stats.setupVictories).toBeGreaterThan(0);
    expect(stats.playingVictories).toBeGreaterThan(0);
    expect(stats.finishedRejections).toBeGreaterThan(0);
    expect(stats.reachedSetup).toBeGreaterThan(50);
    expect(stats.reachedPlaying).toBeGreaterThan(30);
    expect(stats.accepted).toBeGreaterThan(2_000);
    expect(stats.duplicates).toBeGreaterThan(50);
    expect(stats.conflicts).toBeGreaterThan(50);
    expect(stats.revisionMismatch).toBeGreaterThan(50);
    expect(stats.targetMismatch).toBeGreaterThan(100);
    expect(stats.notActive).toBeGreaterThan(50);
    expect(stats.deadlinePassed).toBeGreaterThan(50);
    expect(stats.deadlineNotReached).toBeGreaterThan(50);
    expect(stats.continuations).toBeGreaterThan(20);
    expect(stats.bonusTurns).toBeGreaterThan(50);
    expect(stats.jailSends).toBeGreaterThan(3);
    expect(stats.releasedByDouble).toBeGreaterThan(0);
    expect(stats.releasedByForcedFee).toBeGreaterThan(0);
  });
});
