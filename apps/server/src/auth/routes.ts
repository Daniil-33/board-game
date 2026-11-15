import type { FastifyInstance, FastifyRequest } from 'fastify';
import { GuestLoginRequestSchema, type GuestLoginRequest, type GuestLoginResponse } from '@game/protocol';
import { unauthenticated } from '../http/errors.js';
import type { Guest, GuestStore } from './guests.js';
import { bearerToken } from './tokens.js';

/** The authenticated guest of a request; throws 401 `UNAUTHENTICATED`. */
export async function authenticate(guests: GuestStore, request: FastifyRequest): Promise<Guest> {
  const token = bearerToken(request.headers.authorization);
  if (token === null) throw unauthenticated();
  const guest = await guests.findByToken(token);
  if (guest === null) throw unauthenticated();
  return guest;
}

export function registerAuthRoutes(app: FastifyInstance, guests: GuestStore): void {
  app.post<{ Body: GuestLoginRequest }>('/api/guests', { schema: { body: GuestLoginRequestSchema } }, async (request, reply) => {
    const guest = await guests.create(request.body.nickname);
    const body: GuestLoginResponse = { guestId: guest.guestId, token: guest.token };
    return reply.status(201).send(body);
  });
}
