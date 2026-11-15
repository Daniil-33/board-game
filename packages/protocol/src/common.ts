import { Type, type Static } from '@sinclair/typebox';
import type { CommandId, Expectation, PlayerId, Revision, TargetRef } from '@game/game-core';

/** Wire protocol version carried by `Hello` and `Welcome`. */
export const PROTOCOL_VERSION = 1;

/** Upper bound, in UTF-16 code units, on the text of one WebSocket frame. */
export const MAX_FRAME_LENGTH = 1 << 20;

/** Technical bounds; not product rules. */
export const MAX_ID_LENGTH = 128;
export const MAX_TOKEN_LENGTH = 512;
export const MAX_ERROR_CODE_LENGTH = 64;

/** Closes an object schema: unknown properties are rejected. */
export const closed = { additionalProperties: false } as const;

/**
 * Id strings Postgres can store in `text` and `jsonb`: no U+0000 and no lone
 * surrogate; astral characters (valid surrogate pairs) are allowed. Written to
 * behave the same with and without the regex `u` flag: TypeBox compiles
 * patterns without it, Ajv (`unicodeRegExp`) with it.
 */
export const ID_PATTERN = '^(?:[^\\u0000\\uD800-\\uDFFF]|[\\uD800-\\uDBFF][\\uDC00-\\uDFFF])+$';

const idString = (description: string) =>
  Type.String({ minLength: 1, maxLength: MAX_ID_LENGTH, pattern: ID_PATTERN, description });

export const CommandIdSchema = Type.Unsafe<CommandId>(idString('Client-generated command id, unique within the game.'));
export const PlayerIdSchema = Type.Unsafe<PlayerId>(idString('Game-core player id.'));
export const RevisionSchema = Type.Unsafe<Revision>(
  Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER, description: 'Game revision.' }),
);

/** Room id; also the `gameId` sent in `Hello`. */
export const RoomIdSchema = idString('Room id; equal to the game id used in Hello.');
export type RoomId = Static<typeof RoomIdSchema>;

/** Guest id issued by guest login. */
export const GuestIdSchema = idString('Guest id issued by guest login.');
export type GuestId = Static<typeof GuestIdSchema>;

/** Opaque bearer token: visible ASCII only. */
export const TOKEN_PATTERN = '^[\\x21-\\x7E]+$';
export const TokenSchema = Type.String({
  minLength: 1,
  maxLength: MAX_TOKEN_LENGTH,
  pattern: TOKEN_PATTERN,
  description: 'Opaque guest token issued by guest login.',
});

export const TargetRefSchema = Type.Unsafe<TargetRef>(
  Type.Object(
    {
      kind: Type.String({ minLength: 1, maxLength: MAX_ID_LENGTH, pattern: ID_PATTERN }),
      id: Type.String({ minLength: 1, maxLength: MAX_ID_LENGTH, pattern: ID_PATTERN }),
    },
    closed,
  ),
);

export const ExpectationSchema = Type.Unsafe<Expectation>(
  Type.Union([
    Type.Object({ kind: Type.Literal('revision'), revision: RevisionSchema }, closed),
    Type.Object({ kind: Type.Literal('target'), target: TargetRefSchema }, closed),
  ]),
);

/** Error codes defined by the WebSocket protocol. */
export const PROTOCOL_ERROR_CODES = [
  'PROTOCOL_VERSION_UNSUPPORTED',
  'UNAUTHENTICATED',
  'NOT_A_PARTICIPANT',
  'MALFORMED_FRAME',
  'ROOM_UNAVAILABLE',
  /** The room was closed (its creator left before the start). Final: do not reconnect. */
  'ROOM_CLOSED',
  /** A newer socket of the same guest took over this room. Final for this socket. */
  'CONNECTION_REPLACED',
] as const;
export type ProtocolErrorCode = (typeof PROTOCOL_ERROR_CODES)[number];

/** Additional error codes used by the HTTP lobby. */
export const LOBBY_ERROR_CODES = [
  'NOT_ROOM_CREATOR',
  'INVALID_REQUEST',
  /** The room is locked and the request carried no access code. */
  'ACCESS_CODE_REQUIRED',
  /** The room is locked and the access code is wrong. */
  'ACCESS_CODE_INVALID',
] as const;
export type LobbyErrorCode = (typeof LOBBY_ERROR_CODES)[number];

/**
 * A protocol or lobby code, or an engine error code passed through unchanged.
 * `(string & {})` keeps editor completion for the known codes.
 */
export type ErrorCode = ProtocolErrorCode | LobbyErrorCode | (string & {});

export const ErrorCodeSchema = Type.Unsafe<ErrorCode>(
  Type.String({
    minLength: 1,
    maxLength: MAX_ERROR_CODE_LENGTH,
    description: 'Protocol, lobby or engine error code; engine codes pass through unchanged.',
  }),
);

export const ErrorBodySchema = Type.Object(
  { code: ErrorCodeSchema, message: Type.String() },
  closed,
);
export type ErrorBody = Static<typeof ErrorBodySchema>;
