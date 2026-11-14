import { describe, it, expect } from 'vitest';
import { cmd, ctx, deepFreeze } from './helpers/fixtures.js';
import { gameEngine } from '../rules.js';
import { setupGame, playingGame, types, type Game } from './helpers/game.js';
import { pendingDeadlines, CONTINUATION_MS, SETUP_ROLL_DURATION_MS, TURN_DURATION_MS } from '../deadlines.js';
import { genesis } from '../state.js';
import { lobbyState } from './helpers/fixtures.js';
import type { GameCommand } from '../engine.js';

// spec: engine/deadlines

type Case = { name: string; make: () => Game; command: (g: Game) => GameCommand; dice?: number[] };

const playerCases: Case[] = [
  { name: 'RollForOrder', make: () => setupGame(['a', 'b']), command: (g) => g.rollForOrderCmd('a'), dice: [3] },
  { name: 'RollDice', make: () => playingGame(['a', 'b']), command: (g) => g.rollDiceCmd(), dice: [1, 2] },
  {
    name: 'EndTurn',
    make: () => {
      const g = playingGame(['a', 'b']);
      g.roll(1, 2);
      return g;
    },
    command: (g) => g.endTurnCmd(),
  },
];

const timeoutCases: Case[] = [
  { name: 'setupRoll', make: () => setupGame(['a', 'b']), command: (g) => g.timeoutCmd(), dice: [3] },
  { name: 'turn before roll', make: () => playingGame(['a', 'b']), command: (g) => g.timeoutCmd(), dice: [1, 2] },
  {
    name: 'turn after roll',
    make: () => {
      const g = playingGame(['a', 'b']);
      g.roll(1, 2);
      return g;
    },
    command: (g) => g.timeoutCmd(),
  },
];

function attempt(c: Case, offset: number) {
  const g = c.make();
  const before = g.state;
  const r = g.submit(c.command(g), { at: g.deadline + offset, dice: c.dice });
  return { g, before, r };
}

describe('player commands strictly before the deadline', () => {
  it.each(playerCases)('$name at deadline - 1 is accepted', (c) => {
    expect(attempt(c, -1).r.kind).toBe('accepted');
  });

  it.each(playerCases.flatMap((c) => [0, 1].map((offset) => ({ ...c, offset }))))(
    '$name at deadline + $offset is DEADLINE_PASSED with the state unchanged',
    (c) => {
      const { g, before, r } = attempt(c, c.offset);
      expect(r.kind === 'rejected' && r.error.code).toBe('DEADLINE_PASSED');
      expect(g.state).toBe(before);
    },
  );
});

describe('Timeout at or after the deadline', () => {
  it.each(timeoutCases)('$name at deadline - 1 is DEADLINE_NOT_REACHED with the state unchanged', (c) => {
    const { g, before, r } = attempt(c, -1);
    expect(r.kind === 'rejected' && r.error.code).toBe('DEADLINE_NOT_REACHED');
    expect(g.state).toBe(before);
  });

  it.each(timeoutCases.flatMap((c) => [0, 1].map((offset) => ({ ...c, offset }))))(
    '$name at deadline + $offset is accepted',
    (c) => {
      expect(attempt(c, c.offset).r.kind).toBe('accepted');
    },
  );

  it('the same state accepts Timeout at deadline and deadline + 1 but not deadline - 1', () => {
    const g = playingGame(['a', 'b']);
    const s = deepFreeze(g.state);
    const c = g.timeoutCmd();
    const at = s.turn!.deadline;
    const codes = [at - 1, at, at + 1].map((ms) => {
      const r = gameEngine.execute(s, c, ctx(ms));
      return r.kind === 'accepted' ? 'accepted' : r.error.code;
    });
    expect(codes).toEqual(['DEADLINE_NOT_REACHED', 'accepted', 'accepted']);
  });

  it('only the system actor may issue Timeout', () => {
    const g = playingGame(['a', 'b']);
    const c = { ...g.timeoutCmd(), actor: { kind: 'player' as const, id: 'a' as never } };
    const r = g.submit(c, { at: g.deadline });
    expect(r.kind === 'rejected' && r.error.code).toBe('ACTOR_NOT_ALLOWED');
  });

  it('a non-null payload is INVALID_PAYLOAD', () => {
    const g = playingGame(['a', 'b']);
    const c = { ...g.timeoutCmd(), payload: { target: 'turn' } };
    const r = g.submit(c, { at: g.deadline });
    expect(r.kind === 'rejected' && r.error.code).toBe('INVALID_PAYLOAD');
  });

  it('a stale timer naming a closed turn is TARGET_MISMATCH with the state unchanged', () => {
    const g = playingGame(['a', 'b']);
    const stale = g.timeoutCmd();
    g.roll(1, 2);
    g.endTurn();
    const before = g.state;
    const r = g.submit(stale, { at: g.deadline + 60_000 });
    expect(r.kind === 'rejected' && r.error.code).toBe('TARGET_MISMATCH');
    expect(g.state).toBe(before);
  });

  it('a Timeout naming a setupRoll target while playing is TARGET_MISMATCH', () => {
    const g = playingGame(['a', 'b']);
    const r = g.submit(cmd('Timeout', null, { target: { kind: 'setupRoll', id: g.state.turn!.turnId } }), { at: g.deadline });
    expect(r.kind === 'rejected' && r.error.code).toBe('TARGET_MISMATCH');
  });
});

describe('Timeout before the roll continues the turn', () => {
  it('rolls with auto: true and continues the same turn for 20 s from the Timeout time, quotas unchanged', () => {
    const g = playingGame(['a', 'b']);
    const turn = g.state.turn!;
    const T = turn.deadline + 1_234;
    const events = g.timeout({ at: T, dice: [2, 3] });
    expect(types(events)).toEqual(['DiceRolled', 'PlayerMoved', 'TurnContinued']);
    expect(events[0]!.payload).toMatchObject({ turnId: turn.turnId, dice: [2, 3], double: false, auto: true });
    expect(events[2]!.payload).toEqual({ turnId: turn.turnId, deadline: T + CONTINUATION_MS });
    expect(g.state.turn).toMatchObject({ turnId: turn.turnId, rolled: true, continuation: true, deadline: T + CONTINUATION_MS });
    expect(g.state.turn!.quotas).toEqual(turn.quotas);
  });

  it('the continued turn accepts EndTurn before its new deadline and rejects RollDice', () => {
    const g = playingGame(['a', 'b']);
    g.timeout({ dice: [2, 3] });
    const r = g.submit(g.rollDiceCmd(), { at: g.deadline - 1 });
    expect(r.kind === 'rejected' && r.error.code).toBe('ALREADY_ROLLED');
    expect(g.endTurn(g.deadline - 1)[0]!.payload).toMatchObject({ reason: 'end-turn' });
  });
});

describe('Timeout after the roll closes the turn', () => {
  it('idle after rolling: TurnEnded(timeout) then TurnStarted for the next player at T + 45 s', () => {
    const g = playingGame(['a', 'b']);
    g.roll(1, 2);
    const T = g.deadline + 7;
    const events = g.timeout({ at: T });
    expect(types(events)).toEqual(['TurnEnded', 'TurnStarted']);
    expect(events[0]!.payload).toMatchObject({ reason: 'timeout', playerId: 'a' });
    expect(events[1]!.payload).toMatchObject({ playerId: 'b', deadline: T + TURN_DURATION_MS });
  });

  it('a continued turn closes on its second Timeout', () => {
    const g = playingGame(['a', 'b']);
    g.timeout({ dice: [2, 3] });
    const events = g.timeout();
    expect(types(events)).toEqual(['TurnEnded', 'TurnStarted']);
    expect(g.state.turn!.playerId).toBe('b');
  });
});

describe('pendingDeadlines', () => {
  it('is empty before setup', () => {
    expect(pendingDeadlines(genesis())).toEqual([]);
    expect(pendingDeadlines(lobbyState())).toEqual([]);
  });

  it('lists the current setupRoll in setup', () => {
    const g = setupGame(['a', 'b']);
    expect(pendingDeadlines(g.state)).toEqual([
      { target: { kind: 'setupRoll', id: g.state.setup!.setupRollId }, at: g.now + SETUP_ROLL_DURATION_MS },
    ]);
  });

  it('lists exactly the current turn in playing', () => {
    const g = playingGame(['a', 'b']);
    expect(pendingDeadlines(g.state)).toEqual([
      { target: { kind: 'turn', id: g.state.turn!.turnId }, at: g.state.turn!.deadline },
    ]);
  });

  it('a Timeout built from a listed entry at its time passes the target and deadline checks', () => {
    for (const g of [setupGame(['a', 'b', 'c']), playingGame(['a', 'b'])]) {
      for (let i = 0; i < 6; i++) {
        const [d] = pendingDeadlines(g.state);
        const r = g.submit(cmd('Timeout', null, { target: d!.target }), { at: d!.at });
        expect(r.kind).toBe('accepted');
      }
    }
  });
});
