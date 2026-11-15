import type { Kysely } from 'kysely';
import type { Database } from '../db/schema.js';
import { hashToken, newId, newToken } from './tokens.js';

export interface Guest {
  readonly guestId: string;
  readonly nickname: string;
}

export interface GuestStore {
  /** Create a guest; the token is returned once and only its hash is stored. */
  create(nickname: string): Promise<Guest & { readonly token: string }>;
  /** The guest a token belongs to, or null. */
  findByToken(token: string): Promise<Guest | null>;
}

export function createGuestStore(db: Kysely<Database>): GuestStore {
  return {
    async create(nickname) {
      const guestId = newId('g_');
      const token = newToken();
      await db.insertInto('guests').values({ id: guestId, nickname, token_hash: hashToken(token) }).execute();
      return { guestId, nickname, token };
    },

    async findByToken(token) {
      const row = await db
        .selectFrom('guests')
        .select(['id', 'nickname'])
        .where('token_hash', '=', hashToken(token))
        .executeTakeFirst();
      return row === undefined ? null : { guestId: row.id, nickname: row.nickname };
    },
  };
}
