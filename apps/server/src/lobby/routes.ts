import type { FastifyInstance } from 'fastify';
import {
  CreateRoomRequestSchema,
  JoinRoomRequestSchema,
  RoomParamsSchema,
  type CreateRoomRequest,
  type CreateRoomResponse,
  type GetRoomResponse,
  type JoinRoomRequest,
  type JoinRoomResponse,
  type LeaveRoomResponse,
  type ListRoomsResponse,
  type RoomParams,
  type StartGameResponse,
} from '@game/protocol';
import type { Guest, GuestStore } from '../auth/guests.js';
import { authenticate } from '../auth/routes.js';
import type { LobbyService } from './service.js';

/** Join, leave and create may be sent without a body (the current client does): treat it as `{}`. */
async function emptyBodyAsObject(request: { body: unknown }): Promise<void> {
  if (request.body === undefined) request.body = {};
}

/**
 * Lobby routes, in their own scope: every request is authenticated in
 * `onRequest`, before its body is parsed or validated, so a caller without
 * a valid token always gets 401.
 */
export async function lobbyRoutes(app: FastifyInstance, opts: { guests: GuestStore; lobby: LobbyService }): Promise<void> {
  const { guests, lobby } = opts;
  const authenticated = new WeakMap<object, Guest>();
  app.addHook('onRequest', async (request) => {
    authenticated.set(request, await authenticate(guests, request));
  });
  const guestOf = (request: object): Guest => {
    const guest = authenticated.get(request);
    if (guest === undefined) throw new Error('lobby request was not authenticated');
    return guest;
  };

  app.post<{ Body: CreateRoomRequest }>(
    '/api/rooms',
    { schema: { body: CreateRoomRequestSchema }, preValidation: emptyBodyAsObject },
    async (request, reply) => {
      const guest = guestOf(request);
      const body: CreateRoomResponse = await lobby.create(guest, request.body.accessCode);
      return reply.status(201).send(body);
    },
  );

  app.get('/api/rooms', async (request) => {
    const guest = guestOf(request);
    const body: ListRoomsResponse = { rooms: await lobby.list(guest) };
    return body;
  });

  app.get<{ Params: RoomParams }>('/api/rooms/:roomId', { schema: { params: RoomParamsSchema } }, async (request) => {
    const guest = guestOf(request);
    const body: GetRoomResponse = { room: await lobby.get(guest, request.params.roomId) };
    return body;
  });

  app.post<{ Params: RoomParams; Body: JoinRoomRequest }>(
    '/api/rooms/:roomId/join',
    { schema: { params: RoomParamsSchema, body: JoinRoomRequestSchema }, preValidation: emptyBodyAsObject },
    async (request) => {
      const guest = guestOf(request);
      const body: JoinRoomResponse = { room: await lobby.join(guest, request.params.roomId, request.body.accessCode) };
      return body;
    },
  );

  app.post<{ Params: RoomParams }>('/api/rooms/:roomId/leave', { schema: { params: RoomParamsSchema } }, async (request) => {
    const guest = guestOf(request);
    const body: LeaveRoomResponse = { room: await lobby.leave(guest, request.params.roomId) };
    return body;
  });

  app.post<{ Params: RoomParams }>('/api/rooms/:roomId/start', { schema: { params: RoomParamsSchema } }, async (request) => {
    const guest = guestOf(request);
    const body: StartGameResponse = { room: await lobby.start(guest, request.params.roomId) };
    return body;
  });
}
