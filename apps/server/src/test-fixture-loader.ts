import { checkInvariants } from '@game/game-core';
import { TokenSchema } from '@game/protocol';
import { TypeCompiler } from '@sinclair/typebox/compiler';
import { Type } from '@sinclair/typebox';
import type { FastifyInstance } from 'fastify';
import { sql, type Kysely } from 'kysely';
import { newId } from './auth/tokens.js';
import type { GuestStore } from './auth/guests.js';
import type { Database } from './db/schema.js';
import { ApiError, unauthenticated } from './http/errors.js';
import { buildFixture, FIXTURE_NAMES, type FixtureName } from './test-fixtures.js';

const request = TypeCompiler.Compile(Type.Object({
  fixture: Type.Union(FIXTURE_NAMES.map(name => Type.Literal(name))),
  tokens: Type.Array(TokenSchema, { minItems: 2, maxItems: 6, uniqueItems: true }),
}, { additionalProperties: false }));

export function registerFixtureLoader(app: FastifyInstance, db: Kysely<Database>, guests: GuestStore, now: () => number): void {
  app.post('/api/test/fixtures', async (req, reply) => {
    if (!request.Check(req.body)) throw new ApiError(400, 'INVALID_REQUEST', 'Invalid fixture request');
    const body = req.body as { fixture: FixtureName; tokens: string[] };
    const members = await Promise.all(body.tokens.map(token => guests.findByToken(token)));
    if (members.some(g => g === null)) throw unauthenticated();
    const ids = members.map(g => g!.guestId);
    if (new Set(ids).size !== ids.length) throw new ApiError(400, 'INVALID_REQUEST', 'Distinct guests required');
    const state = buildFixture(body.fixture, ids, now());
    checkInvariants(state);
    const roomId = newId('r_');
    await db.transaction().execute(async trx => {
      await trx.insertInto('rooms').values({ id: roomId, creator_id: ids[0]!, status: 'playing' }).execute();
      await trx.insertInto('room_members').values(ids.map(guest_id => ({ room_id: roomId, guest_id }))).execute();
      await trx.insertInto('game_snapshots').values({
        game_id: roomId, revision: state.revision, state: sql`${JSON.stringify(state)}::jsonb`,
      }).execute();
    });
    return reply.code(201).send({ roomId });
  });
}
