import type { FastifyInstance } from 'fastify';

/** Browser transport policy only; authentication remains in the existing routes. */
export function registerOriginHooks(app: FastifyInstance, allowedOrigins: readonly string[]): void {
  if (allowedOrigins.length === 0) return;
  const allowed = new Set(allowedOrigins);
  app.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith('/api/')) return;
    reply.header('Vary', 'Origin');
    const origin = request.headers.origin;
    if (origin === undefined || !allowed.has(origin)) return;
    reply.header('Access-Control-Allow-Origin', origin);
    if (request.method === 'OPTIONS') {
      reply.header('Access-Control-Allow-Methods', 'GET, POST');
      reply.header('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      return reply.code(204).send();
    }
  });
  app.addHook('preValidation', async (request, reply) => {
    if (request.routeOptions.url === '/ws' &&
        (request.headers.origin === undefined || !allowed.has(request.headers.origin))) {
      return reply.code(403).send({ error: 'Forbidden' });
    }
  });
}
