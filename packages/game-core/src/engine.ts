import type { CommandId, PlayerId, Revision } from './types.js';
import type { TransitionContext } from './context.js';

export type Actor =
  | { readonly kind: 'player'; readonly id: PlayerId }
  | { readonly kind: 'system' };

export type ActorKind = Actor['kind'];

export interface GameCommand<Payload = unknown, Type extends string = string> {
  readonly type: Type;
  readonly commandId: CommandId;
  readonly actor: Actor;
  readonly expectedRevision: Revision;
  readonly payload: Payload;
}

export interface GameEvent<Payload = unknown, Type extends string = string> {
  readonly type: Type;
  readonly payload: Payload;
}

export interface EngineError<Code extends string = string> {
  readonly code: Code;
  readonly message: string;
}

export interface AcceptedResult<
  State,
  Event extends GameEvent = GameEvent,
> {
  readonly kind: 'accepted';
  readonly commandId: CommandId;
  readonly previousRevision: Revision;
  readonly revision: Revision;
  readonly state: State;
  readonly events: readonly Event[];
}

export interface RejectedResult<
  State,
  Code extends string = string,
> {
  readonly kind: 'rejected';
  readonly commandId: CommandId;
  readonly revision: Revision;
  readonly state: State;
  readonly events: readonly [];
  readonly error: EngineError<Code>;
}

export type TransitionResult<
  State,
  Event extends GameEvent = GameEvent,
  Code extends string = string,
> = AcceptedResult<State, Event> | RejectedResult<State, Code>;

export type Transition<
  State,
  Command extends GameCommand = GameCommand,
  Event extends GameEvent = GameEvent,
> = (
  state: State,
  command: Command,
  context: TransitionContext,
) => TransitionResult<State, Event>;

export interface GameEngine<
  State,
  Command extends GameCommand = GameCommand,
  Event extends GameEvent = GameEvent,
> {
  execute(
    state: State,
    command: Command,
    context: TransitionContext,
  ): TransitionResult<State, Event>;
}
