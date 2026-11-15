import type { Static, TSchema } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import {
  CreateRoomResponseSchema,
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
  createRoom(token: string): Promise<RoomSummary>;
  listRooms(token: string): Promise<RoomSummary[]>;
  joinRoom(token: string, roomId: string): Promise<RoomSummary>;
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
    throw new LobbyRequestError(NETWORK_ERROR, 'The server could not be reached');
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new LobbyRequestError(BAD_RESPONSE, `Unreadable response (HTTP ${response.status})`);
  }

  if (!response.ok) {
    if (Value.Check(LobbyErrorSchema, payload)) throw new LobbyRequestError(payload.code, payload.message);
    throw new LobbyRequestError(BAD_RESPONSE, `Unexpected error response (HTTP ${response.status})`);
  }
  // Never render a response that is not what the protocol defines.
  if (!Value.Check(schema, payload)) {
    throw new LobbyRequestError(BAD_RESPONSE, 'The server response does not match the protocol');
  }
  return payload;
}

/** Lobby requests over `fetch`; every response is checked against its protocol schema. */
export function createLobbyApi(fetchFn: FetchLike): LobbyApi {
  return {
    guestLogin: (nickname) =>
      request(fetchFn, GuestLoginResponseSchema, { method: 'POST', path: ROUTES.guests, body: { nickname } }),
    createRoom: async (token) =>
      (await request(fetchFn, CreateRoomResponseSchema, { method: 'POST', path: ROUTES.rooms, token })).room,
    listRooms: async (token) =>
      (await request(fetchFn, ListRoomsResponseSchema, { method: 'GET', path: ROUTES.rooms, token })).rooms,
    joinRoom: async (token, roomId) =>
      (await request(fetchFn, JoinRoomResponseSchema, { method: 'POST', path: ROUTES.joinRoom(roomId), token })).room,
    startGame: async (token, roomId) =>
      (await request(fetchFn, StartGameResponseSchema, { method: 'POST', path: ROUTES.startGame(roomId), token })).room,
  };
}
