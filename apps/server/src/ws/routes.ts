import type { FastifyInstance } from 'fastify';
import { GameConnection, type ConnectionDeps } from './connection.js';

/** `GET /ws`: the game socket. Needs `@fastify/websocket` registered on `app`. */
export function registerGameSocket(app: FastifyInstance, deps: ConnectionDeps): void {
  app.get('/ws', { websocket: true }, (socket) => {
    new GameConnection(socket, deps).start();
  });
}
