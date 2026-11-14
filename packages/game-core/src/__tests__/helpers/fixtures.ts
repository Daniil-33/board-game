import type { Actor, GameCommand } from '../../engine.js';
import type { TransitionContext } from '../../context.js';
import type { CommandId, PlayerId, Revision } from '../../types.js';
import { timestamp } from '../../types.js';
import type { GameState } from '../../state.js';
import { seedRng } from '../../rng.js';

export const SYSTEM: Actor = { kind: 'system' };
export const player = (id: string): Actor => ({ kind: 'player', id: id as PlayerId });
export const pid = (id: string) => id as PlayerId;

export const ctx = (ms = 1_767_225_600_000): TransitionContext => ({ now: timestamp(ms) });

let counter = 0;
export function cmd<P>(
  type: string,
  payload: P,
  opts: { actor?: Actor; rev?: number; id?: string } = {},
): GameCommand<P> {
  counter += 1;
  return {
    type,
    commandId: (opts.id ?? `cmd-${counter}`) as CommandId,
    actor: opts.actor ?? SYSTEM,
    expectedRevision: (opts.rev ?? 0) as Revision,
    payload,
  };
}

/** A lobby with players a and b, built directly (no lifecycle commands). */
export function lobbyState(rev = 3): GameState {
  return {
    revision: rev as Revision,
    rulesVersion: 'core-0',
    phase: 'lobby',
    players: [{ id: pid('a') }, { id: pid('b') }],
    rng: seedRng(99),
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
