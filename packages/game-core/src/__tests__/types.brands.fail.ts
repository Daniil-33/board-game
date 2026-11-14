import type { Entropy, Money, PlayerId, Timestamp } from '../types.js';
import type { Actor, Expectation, GameCommand } from '../engine.js';
import type { CommandSpec } from '../registry.js';
import type { GameState } from '../state.js';
import { STATE_VISIBILITY, type Visibility } from '../projection.js';
import type { CommandId, Revision } from '../types.js';

// Each `@ts-expect-error` below proves a brand or envelope rule is enforced:
// if the line ever compiles cleanly, `tsc --noEmit` fails on the unused directive.
const n: number = 42;

// @ts-expect-error plain number is not assignable to Money
const _m: Money = n;

// @ts-expect-error plain number is not assignable to Timestamp
const _t: Timestamp = n;

const pid = 'p1' as PlayerId;
// @ts-expect-error a bare PlayerId is not an Actor
const _a: Actor = pid;

// A system-actor command needs no PlayerId and must compile.
const _sys: GameCommand<null, 'NOOP'> = {
  type: 'NOOP',
  commandId: 'c1' as CommandId,
  actor: { kind: 'system' },
  expected: { kind: 'revision', revision: 0 as Revision },
  payload: null,
};

// @ts-expect-error a plain number array is not Entropy
const _e: Entropy = [1, 2, 3, 4] as number[];

// @ts-expect-error a bare Revision is not an Expectation
const _x: Expectation = 0 as Revision;

// @ts-expect-error a CommandSpec must declare its concurrency guard
const _spec: CommandSpec = {
  allowedActors: ['system'],
  allowedPhases: ['lobby'],
  handle: () => ({ ok: false, error: { code: 'X', message: 'x' } }),
};

// Every state field must be classified: a map typed against a state with an
// extra field, but missing that field, does not compile.
// @ts-expect-error `extra` has no visibility classification
const _vis: Record<keyof (GameState & { extra: number }), Visibility> = STATE_VISIBILITY;
