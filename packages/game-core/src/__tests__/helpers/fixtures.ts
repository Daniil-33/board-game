import { generateBoard } from '../../board/generate.js';
import type { Actor, Expectation, GameCommand, TargetRef } from '../../engine.js';
import type { TransitionContext } from '../../context.js';
import type { CommandId, Entropy, PlayerId, Revision } from '../../types.js';
import { entropy, timestamp } from '../../types.js';
import { genesis, type GameState } from '../../state.js';
import { seedRng } from '../../rng.js';

export const SYSTEM: Actor = { kind: 'system' };
export const player = (id: string): Actor => ({ kind: 'player', id: id as PlayerId });
export const pid = (id: string) => id as PlayerId;

export const DEFAULT_ENTROPY: Entropy = entropy([0x0badc0de, 0xdeadbeef, 0x12345678, 0x9abcdef0]);

export const ctx = (ms = 1_767_225_600_000, ent: Entropy = DEFAULT_ENTROPY): TransitionContext => ({
  now: timestamp(ms),
  entropy: ent,
});

let counter = 0;
export function cmd<P>(
  type: string,
  payload: P,
  opts: { actor?: Actor; rev?: number; target?: TargetRef; expected?: unknown; id?: string } = {},
): GameCommand<P> {
  counter += 1;
  const expected: Expectation =
    opts.expected !== undefined
      ? (opts.expected as Expectation) // raw, possibly malformed, for robustness tests
      : opts.target !== undefined
        ? { kind: 'target', target: opts.target }
        : { kind: 'revision', revision: (opts.rev ?? 0) as Revision };
  return {
    type,
    commandId: (opts.id ?? `cmd-${counter}`) as CommandId,
    actor: opts.actor ?? SYSTEM,
    expected,
    payload,
  };
}

/** A lobby with players a and b, built directly (no lifecycle commands). */
export function lobbyState(rev = 3): GameState {
  return {
    ...genesis(),
    revision: rev as Revision,
    rulesVersion: 'core-7',
    phase: 'lobby',
    players: [{ id: pid('a') }, { id: pid('b') }],
    ...generateBoard(seedRng(99)),
  };
}

/** Recursively freeze, so any in-place mutation by the engine throws. */
export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}
