import { t } from '../i18n/index';
import type { Static, TSchema } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import {
  CreateRoomResponseSchema,
  AccessCodeSchema,
  GetRoomResponseSchema,
  LeaveRoomResponseSchema,
  type CreateRoomResponse,
  GuestLoginResponseSchema,
  JoinRoomResponseSchema,
  ListRoomsResponseSchema,
  LobbyErrorSchema,
  StartGameResponseSchema,
  type GuestLoginResponse,
  type RoomSummary,
} from '@game/protocol';
import { ROUTES } from './routes';

/** Client-side code for a response that is not what the protocol defines. */
export const BAD_RESPONSE = 'BAD_RESPONSE';
/** Client-side code for a request that never got a response. */
export const NETWORK_ERROR = 'NETWORK_ERROR';

/** A failed lobby request: a server error body, or a client-side code above. */
export class LobbyRequestError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'LobbyRequestError';
    this.code = code;
  }
}

export interface LobbyApi {
  guestLogin(nickname: string): Promise<GuestLoginResponse>;
  createRoom(token: string, accessCode?: string): Promise<CreateRoomResponse>;
  getRoom(token: string, roomId: string): Promise<RoomSummary>;
  leaveRoom(token: string, roomId: string): Promise<RoomSummary>;
  listRooms(token: string): Promise<RoomSummary[]>;
  joinRoom(token: string, roomId: string, accessCode?: string): Promise<RoomSummary>;
  startGame(token: string, roomId: string): Promise<RoomSummary>;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

interface RequestOptions {
  readonly method: 'GET' | 'POST';
  readonly path: string;
  readonly token?: string;
  readonly body?: unknown;
}

async function request<S extends TSchema>(fetchFn: FetchLike, schema: S, options: RequestOptions): Promise<Static<S>> {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (options.token !== undefined) headers.authorization = `Bearer ${options.token}`;
  const init: RequestInit = { method: options.method, headers };
  if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }

  let response: Response;
  try {
    response = await fetchFn(options.path, init);
  } catch {
    throw new LobbyRequestError(NETWORK_ERROR, t('lobby.network_error'));
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new LobbyRequestError(BAD_RESPONSE, t('lobby.unreadable_response', { status: response.status }));
  }

  if (!response.ok) {
    if (Value.Check(LobbyErrorSchema, payload)) throw new LobbyRequestError(payload.code, payload.message);
    throw new LobbyRequestError(BAD_RESPONSE, t('lobby.unexpected_response', { status: response.status }));
  }
  // Never render a response that is not what the protocol defines.
  if (!Value.Check(schema, payload)) {
    throw new LobbyRequestError(BAD_RESPONSE, t('lobby.protocol_mismatch'));
  }
  return payload;
}

function codeBody(accessCode?: string): { accessCode: string } | undefined {
  if (accessCode === undefined || accessCode === '') return undefined;
  if (!Value.Check(AccessCodeSchema, accessCode)) throw new LobbyRequestError('INVALID_REQUEST', t('lobby.invalid_access_code'));
  return { accessCode };
}

/** Lobby requests over `fetch`; every response is checked against its protocol schema. */
export function createLobbyApi(fetchFn: FetchLike): LobbyApi {
  return {
    guestLogin: (nickname) =>
      request(fetchFn, GuestLoginResponseSchema, { method: 'POST', path: ROUTES.guests, body: { nickname } }),
    createRoom: async (token, accessCode) =>
      request(fetchFn, CreateRoomResponseSchema, { method: 'POST', path: ROUTES.rooms, token, body: codeBody(accessCode) }),
    getRoom: async (token, roomId) =>
      (await request(fetchFn, GetRoomResponseSchema, { method: 'GET', path: ROUTES.getRoom(roomId), token })).room,
    leaveRoom: async (token, roomId) =>
      (await request(fetchFn, LeaveRoomResponseSchema, { method: 'POST', path: ROUTES.leaveRoom(roomId), token })).room,
    listRooms: async (token) =>
      (await request(fetchFn, ListRoomsResponseSchema, { method: 'GET', path: ROUTES.rooms, token })).rooms,
    joinRoom: async (token, roomId, accessCode) =>
      (await request(fetchFn, JoinRoomResponseSchema, { method: 'POST', path: ROUTES.joinRoom(roomId), token, body: codeBody(accessCode) })).room,
    startGame: async (token, roomId) =>
      (await request(fetchFn, StartGameResponseSchema, { method: 'POST', path: ROUTES.startGame(roomId), token })).room,
  };
}
