import { Type, type Static } from '@sinclair/typebox';
import type { GameEvent, StateView } from '@game/game-core';
import {
  CommandIdSchema,
  ErrorBodySchema,
  ErrorCodeSchema,
  ExpectationSchema,
  PlayerIdSchema,
  RevisionSchema,
  RoomIdSchema,
  TokenSchema,
  closed,
} from './common.js';

/**
 * Command types a client may send in stage 1, named as in game-core
 * (`setupCommands`, `turnCommands`, resignation). Every payload is `null`.
 * System commands (`CreateGame`, `AddPlayer`, `LeaveLobby`, `StartGame`,
 * `Timeout`) are never accepted from a client.
 */
export const CLIENT_COMMAND_TYPES = ['RollForOrder', 'RollDice', 'EndTurn', 'Resign'] as const;
export type ClientCommandType = (typeof CLIENT_COMMAND_TYPES)[number];

// ---- Shared parts ----------------------------------------------------------

export const StateViewSchema = Type.Unsafe<StateView>(
  Type.Object(
    {},
    {
      additionalProperties: true,
      description:
        'Public projection of the game state (game-core StateView), checked only as a JSON object. ' +
        'Includes the public generated board, economy and balances. ' +
        'Interim jail state in this view is temporary (stage 1 interim rule, replaced in stage 6).',
    },
  ),
);

/** Event payload is required; an event without data carries `payload: null`. */
export const GameEventSchema = Type.Unsafe<GameEvent>(
  Type.Object({ type: Type.String({ minLength: 1 }), payload: Type.Unknown() }, closed),
);

// ---- Client frames ---------------------------------------------------------

export const HelloFrameSchema = Type.Object(
  {
    t: Type.Literal('Hello'),
    protocolVersion: Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }),
    token: TokenSchema,
    gameId: RoomIdSchema,
    lastRevision: Type.Union([RevisionSchema, Type.Null()]),
  },
  closed,
);

const commandFrame = <T extends ClientCommandType>(type: T) =>
  Type.Object(
    {
      t: Type.Literal('Command'),
      commandId: CommandIdSchema,
      type: Type.Literal(type),
      expected: ExpectationSchema,
      payload: Type.Null(),
    },
    closed,
  );

/** One schema per command type, so per-type payloads can be added without changing the frame. */
export const CommandFrameSchema = Type.Union(CLIENT_COMMAND_TYPES.map((type) => commandFrame(type)));

export const ClientFrameSchema = Type.Union([HelloFrameSchema, CommandFrameSchema]);

// ---- Server frames ---------------------------------------------------------

export const WelcomeFrameSchema = Type.Object(
  {
    t: Type.Literal('Welcome'),
    protocolVersion: Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }),
    playerId: PlayerIdSchema,
    revision: RevisionSchema,
    view: StateViewSchema,
  },
  closed,
);

export const AckFrameSchema = Type.Union([
  Type.Object(
    {
      t: Type.Literal('Ack'),
      commandId: CommandIdSchema,
      outcome: Type.Literal('accepted'),
      revision: RevisionSchema,
    },
    closed,
  ),
  Type.Object(
    {
      t: Type.Literal('Ack'),
      commandId: CommandIdSchema,
      outcome: Type.Literal('rejected'),
      revision: RevisionSchema,
      error: ErrorBodySchema,
    },
    closed,
  ),
]);

export const UpdateFrameSchema = Type.Object(
  {
    t: Type.Literal('Update'),
    revision: RevisionSchema,
    view: StateViewSchema,
    events: Type.Array(GameEventSchema),
  },
  closed,
);

export const ErrorFrameSchema = Type.Object(
  { t: Type.Literal('Error'), code: ErrorCodeSchema, message: Type.String() },
  closed,
);

export const ServerFrameSchema = Type.Union([WelcomeFrameSchema, AckFrameSchema, UpdateFrameSchema, ErrorFrameSchema]);

// ---- Types -----------------------------------------------------------------

export type HelloFrame = Static<typeof HelloFrameSchema>;
export type CommandFrame = Static<typeof CommandFrameSchema>;
export type ClientFrame = HelloFrame | CommandFrame;

export type WelcomeFrame = Static<typeof WelcomeFrameSchema>;
export type AckFrame = Static<typeof AckFrameSchema>;
export type UpdateFrame = Static<typeof UpdateFrameSchema>;
export type ErrorFrame = Static<typeof ErrorFrameSchema>;
export type ServerFrame = WelcomeFrame | AckFrame | UpdateFrame | ErrorFrame;
