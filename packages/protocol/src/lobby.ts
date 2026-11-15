import { Type, type Static } from '@sinclair/typebox';
import { GuestIdSchema, MAX_TOKEN_LENGTH, RoomIdSchema, TokenSchema, closed } from './common.js';
import { NICKNAME_FORMAT } from './nickname.js';

export const NicknameSchema = Type.String({
  format: NICKNAME_FORMAT.name,
  description: '1-24 printable Unicode code points, no leading or trailing whitespace.',
});

/**
 * Headers of an authenticated lobby request. Open object: real requests carry
 * other headers. Header names are lower-case as delivered by Node.js.
 */
export const AuthHeadersSchema = Type.Object(
  {
    authorization: Type.String({
      pattern: `^Bearer [\\x21-\\x7E]{1,${MAX_TOKEN_LENGTH}}$`,
      description: 'Bearer <token> from guest login.',
    }),
  },
  { additionalProperties: true },
);
export type AuthHeaders = Static<typeof AuthHeadersSchema>;

// ---- Room ------------------------------------------------------------------

/**
 * `lobby` before the start, `playing` after it, `finished` once the game has a
 * winner, `closed` when the creator left before the start.
 */
export const RoomStatusSchema = Type.Union([
  Type.Literal('lobby'),
  Type.Literal('playing'),
  Type.Literal('finished'),
  Type.Literal('closed'),
]);
export type RoomStatus = Static<typeof RoomStatusSchema>;

export const RoomMemberSchema = Type.Object({ guestId: GuestIdSchema, nickname: NicknameSchema }, closed);
export type RoomMember = Static<typeof RoomMemberSchema>;

export const RoomSummarySchema = Type.Object(
  {
    roomId: RoomIdSchema,
    creatorId: GuestIdSchema,
    status: RoomStatusSchema,
    locked: Type.Boolean({ description: 'The room has an access code; joining requires it.' }),
    joinable: Type.Boolean({
      description: 'Open to anyone now: status lobby, no access code and a free seat.',
    }),
    members: Type.Array(RoomMemberSchema),
  },
  closed,
);
export type RoomSummary = Static<typeof RoomSummarySchema>;

const RoomResponseSchema = Type.Object({ room: RoomSummarySchema }, closed);

/** Path parameters of get, join, leave and start. */
export const RoomParamsSchema = Type.Object({ roomId: RoomIdSchema }, closed);
export type RoomParams = Static<typeof RoomParamsSchema>;

// ---- Access code -----------------------------------------------------------

export const ACCESS_CODE_MIN_LENGTH = 4;
export const ACCESS_CODE_MAX_LENGTH = 32;
export const ACCESS_CODE_PATTERN = '^[A-Za-z0-9_-]+$';

/** Room access code chosen by the creator: URL-safe and typeable. */
export const AccessCodeSchema = Type.String({
  minLength: ACCESS_CODE_MIN_LENGTH,
  maxLength: ACCESS_CODE_MAX_LENGTH,
  pattern: ACCESS_CODE_PATTERN,
  description: '4-32 characters from A-Z, a-z, 0-9, _ and -.',
});

// ---- Guest login -----------------------------------------------------------

export const GuestLoginRequestSchema = Type.Object({ nickname: NicknameSchema }, closed);
export type GuestLoginRequest = Static<typeof GuestLoginRequestSchema>;

export const GuestLoginResponseSchema = Type.Object({ guestId: GuestIdSchema, token: TokenSchema }, closed);
export type GuestLoginResponse = Static<typeof GuestLoginResponseSchema>;

// ---- Create / list / get / join / leave / start ----------------------------

/** Create room: authenticated. Without `accessCode` the room is open. */
export const CreateRoomRequestSchema = Type.Object({ accessCode: Type.Optional(AccessCodeSchema) }, closed);
export type CreateRoomRequest = Static<typeof CreateRoomRequestSchema>;

/**
 * `accessCode` and `inviteLink` are present together, only for a locked room.
 * `inviteLink` is relative to the client origin: `/?room=<roomId>&code=<code>`.
 */
export const CreateRoomResponseSchema = Type.Object(
  {
    room: RoomSummarySchema,
    accessCode: Type.Optional(AccessCodeSchema),
    inviteLink: Type.Optional(Type.String({ minLength: 1, maxLength: 512 })),
  },
  closed,
);
export type CreateRoomResponse = Static<typeof CreateRoomResponseSchema>;

/** List rooms: authenticated, no request body. */
export const ListRoomsResponseSchema = Type.Object({ rooms: Type.Array(RoomSummarySchema) }, closed);
export type ListRoomsResponse = Static<typeof ListRoomsResponseSchema>;

/** Get room: authenticated, members only, path `RoomParams`. */
export const GetRoomResponseSchema = RoomResponseSchema;
export type GetRoomResponse = Static<typeof GetRoomResponseSchema>;

/** Join room: authenticated, path `RoomParams`; a missing body counts as `{}`. */
export const JoinRoomRequestSchema = Type.Object({ accessCode: Type.Optional(AccessCodeSchema) }, closed);
export type JoinRoomRequest = Static<typeof JoinRoomRequestSchema>;

export const JoinRoomResponseSchema = RoomResponseSchema;
export type JoinRoomResponse = Static<typeof JoinRoomResponseSchema>;

/**
 * Leave room before the start: authenticated, path `RoomParams`, no request
 * body. The summary after leaving; status `closed` when the creator left.
 */
export const LeaveRoomResponseSchema = RoomResponseSchema;
export type LeaveRoomResponse = Static<typeof LeaveRoomResponseSchema>;

/** Start game: authenticated, creator only, path `RoomParams`, no request body. */
export const StartGameResponseSchema = RoomResponseSchema;
export type StartGameResponse = Static<typeof StartGameResponseSchema>;

/** Error body of every lobby error response: `ErrorBodySchema` from common. */
export { ErrorBodySchema as LobbyErrorSchema, type ErrorBody as LobbyError } from './common.js';
