import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import { NICKNAME_FORMAT } from '@game/protocol';
import { errorFields, type Logger } from '../logger.js';
import { ApiError } from './errors.js';

/** Upper bound on a request body; lobby bodies are a few dozen bytes. */
export const BODY_LIMIT = 16 * 1024;

/**
 * The Fastify instance shared by every route: strict Ajv (no removal of
 * unknown properties, no coercion, the protocol nickname format), one error
 * shape `{ code, message }`, and a request log that never holds headers,
 * bodies or query strings (tokens and access codes travel there).
 */
export function createHttpApp(logger: Logger): FastifyInstance {
  const app = Fastify({
    logger: false,
    bodyLimit: BODY_LIMIT,
    // Ids may contain any storable code point; do not let a router limit cut them.
    routerOptions: { maxParamLength: 1024 },
    ajv: {
      customOptions: {
        removeAdditional: false,
        coerceTypes: false,
        useDefaults: false,
        allErrors: false,
      },
      plugins: [
        (ajv) => ajv.addFormat(NICKNAME_FORMAT.name, NICKNAME_FORMAT.validate),
      ],
    },
  });

  app.addHook('onResponse', async (request, reply) => {
    logger.info('http request', {
      method: request.method,
      route: request.routeOptions.url ?? 'unknown',
      status: reply.statusCode,
      ms: Math.round(reply.elapsedTime),
    });
  });

  app.setErrorHandler((error: FastifyError | ApiError, request, reply) => {
    if (error instanceof ApiError) {
      return reply.status(error.statusCode).send({ code: error.code, message: error.message });
    }
    if (error.validation !== undefined) {
      const first = error.validation[0];
      const where = first ? `${error.validationContext ?? 'request'}${first.instancePath}` : 'request';
      return reply.status(400).send({ code: 'INVALID_REQUEST', message: `Invalid ${where}: ${first?.message ?? 'schema mismatch'}` });
    }
    const status = error.statusCode;
    if (status !== undefined && status >= 400 && status < 500) {
      // Body parsing (invalid JSON, empty JSON body, size, media type): Fastify's message names the problem, not the input.
      return reply.status(status).send({ code: 'INVALID_REQUEST', message: error.message });
    }
    logger.error('request failed', { method: request.method, route: request.routeOptions.url ?? 'unknown', requestId: request.id, ...errorFields(error) });
    return reply.status(500).send({ code: 'ROOM_UNAVAILABLE', message: 'The server could not handle the request' });
  });

  app.setNotFoundHandler((_request, reply) => reply.status(404).send({ code: 'INVALID_REQUEST', message: 'No such route' }));

  return app;
}
