import type { Money, PlayerId, Timestamp } from '../types.js';
import type { Actor, GameCommand } from '../engine.js';
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
  expectedRevision: 0 as Revision,
  payload: null,
};
