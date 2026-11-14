import { describe, it, expect } from 'vitest';
import type {
  GameCommand,
  GameEvent,
  GameEngine,
  AcceptedResult,
  RejectedResult,
  TransitionResult,
} from '../engine.js';
import type { CommandId, PlayerId, Revision } from '../types.js';
import { timestamp } from '../types.js';
import type { TransitionContext } from '../context.js';

// Minimal concrete state for fixture testing
interface FixtureState {
  readonly revision: Revision;
  readonly value: number;
}

type FixtureCommand = GameCommand<{ increment: number }, 'INCREMENT'>;
type FixtureEvent = GameEvent<{ delta: number }, 'INCREMENTED'>;

function makeContext(): TransitionContext {
  return { now: timestamp(1_767_225_600_000) };
}

function makeCommand(expectedRevision: number): FixtureCommand {
  return {
    type: 'INCREMENT',
    commandId: 'cmd-1' as CommandId,
    actor: { kind: 'player', id: 'player-1' as PlayerId },
    expectedRevision: expectedRevision as Revision,
    payload: { increment: 1 },
  };
}

const stubEngine: GameEngine<FixtureState, FixtureCommand, FixtureEvent> = {
  execute(state, command, _context): TransitionResult<FixtureState, FixtureEvent> {
    if (command.expectedRevision !== state.revision) {
      return {
        kind: 'rejected',
        commandId: command.commandId,
        revision: state.revision,
        state,
        events: [],
        error: { code: 'REVISION_MISMATCH', message: 'Revision mismatch' },
      } satisfies RejectedResult<FixtureState>;
    }
    const nextRevision = (state.revision + 1) as Revision;
    return {
      kind: 'accepted',
      commandId: command.commandId,
      previousRevision: state.revision,
      revision: nextRevision,
      state: { revision: nextRevision, value: state.value + command.payload.increment },
      events: [{ type: 'INCREMENTED', payload: { delta: command.payload.increment } }],
    } satisfies AcceptedResult<FixtureState, FixtureEvent>;
  },
};

describe('engine contracts fixture', () => {
  const initialState: FixtureState = { revision: 0 as Revision, value: 0 };

  it('accepted: revision increments by 1', () => {
    const result = stubEngine.execute(initialState, makeCommand(0), makeContext());
    expect(result.kind).toBe('accepted');
    expect(result.revision).toBe(1);
  });

  it('accepted: state carries the new revision', () => {
    const result = stubEngine.execute(initialState, makeCommand(0), makeContext());
    expect(result.kind).toBe('accepted');
    if (result.kind === 'accepted') {
      expect(result.state.revision).toBe(1);
    }
  });

  it('rejected: state is reference-equal to input', () => {
    const result = stubEngine.execute(initialState, makeCommand(99), makeContext());
    expect(result.kind).toBe('rejected');
    expect(result.state).toBe(initialState);
  });

  it('rejected: revision unchanged', () => {
    const result = stubEngine.execute(initialState, makeCommand(99), makeContext());
    expect(result.revision).toBe(0);
  });

  it('rejected: events is empty array', () => {
    const result = stubEngine.execute(initialState, makeCommand(99), makeContext());
    expect(result.events).toEqual([]);
  });
});
