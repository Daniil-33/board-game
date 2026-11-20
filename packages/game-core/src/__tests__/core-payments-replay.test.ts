import { describe, expect, it } from 'vitest';
import { createEngine, createSession, entropy, gameCommands, ok, openCharge, replay, targetGuard, type CommandRegistry, type GameCommand, type GameEvent } from '../index.js';
import { CURRENT_RULES_VERSION } from '../lifecycle.js';
import { timestamp } from '../types.js';
import { cmd, pid, player } from './helpers/fixtures.js';

const testCommands: CommandRegistry = {
  PrepareReplayFixture: {
    guard: targetGuard('turn', s => s.turn?.turnId ?? null), allowedActors: ['system'], allowedPhases: ['playing'],
    handle(state, command) {
      const { assetId } = command.payload as { assetId: string };
      const payer = state.turn!.playerId;
      return ok({ ...state, owners: { ...state.owners, [assetId]: payer }, turn: { ...state.turn!, rolled: true } }, []);
    },
  },
  OpenReplayCharge: {
    guard: targetGuard('turn', s => s.turn?.turnId ?? null), allowedActors: ['system'], allowedPhases: ['playing'],
    handle(state, command) {
      const { amount } = command.payload as { amount: number };
      const opened = openCharge(state, amount as never);
      return ok(opened.state, opened.events);
    },
  },
};
const engine = createEngine({ ...gameCommands, ...testCommands });

describe('bank charge replay', () => {
  it('replays ChargeDue, ChargePaid and a bank bankruptcy after a same-turn redeem rejection', () => {
    const session = createSession(engine);
    const liveEvents: GameEvent[] = [];
    let serial = 0;
    const submit = (type: string, payload: unknown = null) => {
      const state = session.state;
      const isOrderRoll = type === 'RollForOrder';
      const playerTurnCommand = ['Mortgage', 'Redeem', 'PayCharge'].includes(type);
      const actor = isOrderRoll ? player(state.setup!.playerId) : playerTurnCommand ? player(state.turn!.playerId) : { kind: 'system' as const };
      const expected = state.setup && isOrderRoll
        ? { kind: 'target' as const, target: { kind: 'setupRoll', id: state.setup.setupRollId } }
        : state.turn
          ? { kind: 'target' as const, target: { kind: 'turn', id: state.turn.turnId } }
          : { kind: 'revision' as const, revision: state.revision };
      const command: GameCommand = { type, payload, commandId: `replay-${++serial}` as never, actor, expected };
      const value = serial;
      const result = session.submit(command, { now: timestamp(1_767_225_600_000 + value * 1000), entropy: entropy([value, value + 1, value + 2, value + 3]) });
      if (result.kind === 'accepted') liveEvents.push(...result.events);
      return result;
    };

    expect(submit('CreateGame', { seed: 42, rulesVersion: CURRENT_RULES_VERSION }).kind).toBe('accepted');
    expect(submit('AddPlayer', { playerId: 'a' }).kind).toBe('accepted');
    expect(submit('AddPlayer', { playerId: 'b' }).kind).toBe('accepted');
    expect(submit('StartGame').kind).toBe('accepted');
    for (let i = 0; session.state.setup !== null && i < 30; i++) expect(submit('RollForOrder').kind).toBe('accepted');
    expect(session.state.phase).toBe('playing');
    const payerId = session.state.turn!.playerId;
    const asset = session.state.board!.cells[1]!.asset!;
    expect(submit('PrepareReplayFixture', { assetId: asset.assetId }).kind).toBe('accepted');
    expect(submit('Mortgage', { assetId: asset.assetId }).kind).toBe('accepted');
    const redeem = submit('Redeem', { assetId: asset.assetId });
    expect(redeem.kind === 'rejected' && redeem.error.code).toBe('REDEEM_LOCKED');
    expect(submit('OpenReplayCharge', { amount: 60 }).kind).toBe('accepted');
    expect(submit('PayCharge').kind).toBe('accepted');
    expect(submit('OpenReplayCharge', { amount: 1_000_000 }).kind).toBe('accepted');
    expect(submit('PayCharge').kind).toBe('accepted');

    expect(liveEvents.map(event => event.type)).toContain('ChargeDue');
    expect(liveEvents.map(event => event.type)).toContain('ChargePaid');
    expect(liveEvents.map(event => event.type)).toContain('PlayerBankrupt');
    const rebuilt = replay(engine, session.log);
    expect(rebuilt.state).toEqual(session.state);
    expect(rebuilt.log.map(entry => entry.events)).toEqual(session.log.map(entry => entry.events));
    expect(rebuilt.log.flatMap(entry => entry.events).map(event => event.type)).toContain('ChargeDue');
    expect(rebuilt.log.flatMap(entry => entry.events).map(event => event.type)).toContain('ChargePaid');
    expect(rebuilt.state.eliminated).toContain(payerId);
  });
});
