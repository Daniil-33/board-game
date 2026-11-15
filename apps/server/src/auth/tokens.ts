import { createHash, randomBytes } from 'node:crypto';

/** A fresh opaque guest token: 32 CSPRNG bytes, base64url (43 characters). */
export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * What the database stores for a token: SHA-256, hex. A 256-bit random token
 * needs no slow hash, and the hash is the lookup key.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** A server-generated id: `prefix` + 16 CSPRNG bytes, base64url. */
export function newId(prefix: string): string {
  return prefix + randomBytes(16).toString('base64url');
}

const BEARER = /^Bearer ([\x21-\x7E]{1,512})$/;

/** The token of an `authorization: Bearer <token>` header, or null when absent or malformed. */
export function bearerToken(header: string | string[] | undefined): string | null {
  if (typeof header !== 'string') return null;
  return BEARER.exec(header)?.[1] ?? null;
}
