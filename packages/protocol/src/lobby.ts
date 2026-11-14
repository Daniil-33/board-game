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

export const RoomStatusSchema = Type.Union([Type.Literal('lobby'), Type.Literal('playing')]);
export type RoomStatus = Static<typeof RoomStatusSchema>;

export const RoomMemberSchema = Type.Object({ guestId: GuestIdSchema, nickname: NicknameSchema }, closed);
export type RoomMember = Static<typeof RoomMemberSchema>;

export const RoomSummarySchema = Type.Object(
  {
    roomId: RoomIdSchema,
    creatorId: GuestIdSchema,
    status: RoomStatusSchema,
    members: Type.Array(RoomMemberSchema),
  },
  closed,
);
export type RoomSummary = Static<typeof RoomSummarySchema>;

const RoomResponseSchema = Type.Object({ room: RoomSummarySchema }, closed);

/** Path parameters of join room and start game. */
export const RoomParamsSchema = Type.Object({ roomId: RoomIdSchema }, closed);
export type RoomParams = Static<typeof RoomParamsSchema>;

// ---- Guest login -----------------------------------------------------------

export const GuestLoginRequestSchema = Type.Object({ nickname: NicknameSchema }, closed);
export type GuestLoginRequest = Static<typeof GuestLoginRequestSchema>;

export const GuestLoginResponseSchema = Type.Object({ guestId: GuestIdSchema, token: TokenSchema }, closed);
export type GuestLoginResponse = Static<typeof GuestLoginResponseSchema>;

// ---- Create / list / join / start -----------------------------------------

/** Create room: authenticated, no request body. */
export const CreateRoomResponseSchema = RoomResponseSchema;
export type CreateRoomResponse = Static<typeof CreateRoomResponseSchema>;

/** List joinable rooms: authenticated, no request body. */
export const ListRoomsResponseSchema = Type.Object({ rooms: Type.Array(RoomSummarySchema) }, closed);
export type ListRoomsResponse = Static<typeof ListRoomsResponseSchema>;

/** Join room: authenticated, path `RoomParams`, no request body. */
export const JoinRoomResponseSchema = RoomResponseSchema;
export type JoinRoomResponse = Static<typeof JoinRoomResponseSchema>;

/** Start game: authenticated, creator only, path `RoomParams`, no request body. */
export const StartGameResponseSchema = RoomResponseSchema;
export type StartGameResponse = Static<typeof StartGameResponseSchema>;

/** Error body of every lobby error response: `ErrorBodySchema` from common. */
export { ErrorBodySchema as LobbyErrorSchema, type ErrorBody as LobbyError } from './common.js';
