import { Type, type Static } from '@sinclair/typebox';
import type { GameEvent, Revision, StateView } from '@game/game-core';
import {
  CommandIdSchema,
  AssetIdSchema,
  ErrorBodySchema,
  ErrorCodeSchema,
  ExpectationSchema,
  PlayerIdSchema,
  RevisionSchema,
  RoomIdSchema,
  TokenSchema,
  closed,
  ID_PATTERN,
  MAX_ID_LENGTH,
} from './common.js';
import { CHAT_LIMITS, CHAT_REJECT_REASONS, MAX_CHAT_FRAME_TEXT } from './chat.js';

/**
 * Command types a client may send through stage 5, named as in game-core
 * (`setupCommands`, `turnCommands`, resignation). House and mortgage commands carry an assetId; other payloads are null.
 * System commands (`CreateGame`, `AddPlayer`, `LeaveLobby`, `StartGame`,
 * `Timeout`) are never accepted from a client.
 */
export const CLIENT_COMMAND_TYPES = ['RollForOrder', 'RollDice', 'EndTurn', 'Resign', 'BuyAsset', 'StartAuction', 'Bid', 'PassAuction', 'PayRent', 'PayCharge', 'PayJailFee', 'PlaceCasinoBet', 'DeclineCasino', 'BuildHouse', 'SellHouse', 'Mortgage', 'Redeem'] as const;
export type ClientCommandType = (typeof CLIENT_COMMAND_TYPES)[number];

// ---- Shared parts ----------------------------------------------------------

export const StateViewSchema = Type.Unsafe<StateView>(
  Type.Object(
    {},
    {
      additionalProperties: true,
      description:
        'Public projection of the game state (game-core StateView), checked only as a JSON object. ' +
        'Includes the public generated board, economy, balances, asset owners, purchase decision, auction state, houses, rent, casino and rent quotes.',
    },
  ),
);

/** Event payload is required; an event without data carries `payload: null`. */
export const GameEventSchema = Type.Unsafe<GameEvent>(
  Type.Object({ type: Type.String({ minLength: 1 }), payload: Type.Unknown() }, closed),
);

const TimestampSchema = Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER, description: 'Epoch milliseconds.' });

/** A stored chat message. `seq` orders the messages of one room. */
export const ChatMessageSchema = Type.Object(
  {
    seq: Type.Integer({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER }),
    authorId: PlayerIdSchema,
    text: Type.String({ minLength: 1, maxLength: CHAT_LIMITS.maxCodePoints * 2 }),
    at: TimestampSchema,
  },
  closed,
);

/** One log entry as the viewer may see it: its revision, transition time and projected events. */
export const HistoryEntrySchema = Type.Object(
  {
    revision: Type.Unsafe<Revision>(Type.Integer({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER })),
    at: TimestampSchema,
    events: Type.Array(GameEventSchema),
  },
  closed,
);

/** `Welcome.history`: recent log entries and chat, both oldest first. */
export const HistorySchema = Type.Object(
  { entries: Type.Array(HistoryEntrySchema), chat: Type.Array(ChatMessageSchema) },
  closed,
);

export const ChatRejectReasonSchema = Type.Union(CHAT_REJECT_REASONS.map((reason) => Type.Literal(reason)));

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
      payload: type === 'BuildHouse' || type === 'SellHouse' || type === 'Mortgage' || type === 'Redeem'
        ? Type.Object({ assetId: AssetIdSchema }, closed) : type === 'PlaceCasinoBet' ? Type.Object({amount:Type.Integer({minimum:0,maximum:Number.MAX_SAFE_INTEGER})},closed) : Type.Null(),
    },
    closed,
  );

/** One schema per command type, so per-type payloads can be added without changing the frame. */
export const CommandFrameSchema = Type.Union(CLIENT_COMMAND_TYPES.map((type) => commandFrame(type)));

export const ChatSendFrameSchema = Type.Object(
  {
    t: Type.Literal('ChatSend'),
    clientMsgId: Type.String({ minLength: 1, maxLength: MAX_ID_LENGTH, pattern: ID_PATTERN }),
    text: Type.String({ maxLength: MAX_CHAT_FRAME_TEXT }),
  },
  closed,
);

export const ClientFrameSchema = Type.Union([HelloFrameSchema, CommandFrameSchema, ChatSendFrameSchema]);

// ---- Server frames ---------------------------------------------------------

export const WelcomeFrameSchema = Type.Object(
  {
    t: Type.Literal('Welcome'),
    protocolVersion: Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }),
    playerId: PlayerIdSchema,
    revision: RevisionSchema,
    view: StateViewSchema,
    history: HistorySchema,
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

export const ChatFrameSchema = Type.Object({ t: Type.Literal('Chat'), message: ChatMessageSchema }, closed);

export const ChatAckFrameSchema = Type.Union([
  Type.Object(
    { t: Type.Literal('ChatAck'), clientMsgId: ChatSendFrameSchema.properties.clientMsgId, ok: Type.Literal(true) },
    closed,
  ),
  Type.Object(
    {
      t: Type.Literal('ChatAck'),
      clientMsgId: ChatSendFrameSchema.properties.clientMsgId,
      ok: Type.Literal(false),
      reason: ChatRejectReasonSchema,
    },
    closed,
  ),
]);

export const ServerFrameSchema = Type.Union([
  WelcomeFrameSchema,
  AckFrameSchema,
  UpdateFrameSchema,
  ErrorFrameSchema,
  ChatFrameSchema,
  ChatAckFrameSchema,
]);

// ---- Types -----------------------------------------------------------------

export type HelloFrame = Static<typeof HelloFrameSchema>;
export type CommandFrame = Static<typeof CommandFrameSchema>;
export type ChatSendFrame = Static<typeof ChatSendFrameSchema>;
export type ClientFrame = HelloFrame | CommandFrame | ChatSendFrame;

export type WelcomeFrame = Static<typeof WelcomeFrameSchema>;
export type AckFrame = Static<typeof AckFrameSchema>;
export type UpdateFrame = Static<typeof UpdateFrameSchema>;
export type ErrorFrame = Static<typeof ErrorFrameSchema>;
export type ChatFrame = Static<typeof ChatFrameSchema>;
export type ChatAckFrame = Static<typeof ChatAckFrameSchema>;
export type ChatMessage = Static<typeof ChatMessageSchema>;
export type HistoryEntry = Static<typeof HistoryEntrySchema>;
export type History = Static<typeof HistorySchema>;
export type ServerFrame = WelcomeFrame | AckFrame | UpdateFrame | ErrorFrame | ChatFrame | ChatAckFrame;
