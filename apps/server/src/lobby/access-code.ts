import { randomBytes, scrypt as scryptCallback, timingSafeEqual, type ScryptOptions } from 'node:crypto';

const scrypt = (password: string, salt: Buffer, keylen: number, options: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) => {
    scryptCallback(password, salt, keylen, options, (error, key) => (error ? reject(error) : resolve(key)));
  });

/** scrypt cost parameters (N = 2^14, r = 8, p = 1: about 16 MiB and a few tens of ms). */
const N = 1 << 14;
const R = 8;
const P = 1;
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
/** Bound on N accepted from a stored hash, so a bad row cannot exhaust memory. */
const MAX_N = 1 << 17;

/** `scrypt$<N>$<r>$<p>$<salt b64url>$<hash b64url>`; never contains the code. */
export async function hashAccessCode(code: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await scrypt(code, salt, KEY_LENGTH, { N, r: R, p: P });
  return ['scrypt', N, R, P, salt.toString('base64url'), key.toString('base64url')].join('$');
}

/** Whether `code` matches `stored`. A malformed stored hash never matches. */
export async function verifyAccessCode(code: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [n, r, p] = parts.slice(1, 4).map((v) => (/^[0-9]{1,7}$/.test(v!) ? Number(v) : NaN)) as [number, number, number];
  if (!(n >= 2 && n <= MAX_N && (n & (n - 1)) === 0 && r >= 1 && r <= 32 && p >= 1 && p <= 16)) return false;
  const salt = Buffer.from(parts[4]!, 'base64url');
  const expected = Buffer.from(parts[5]!, 'base64url');
  if (salt.length === 0 || expected.length !== KEY_LENGTH) return false;
  try {
    const actual = await scrypt(code, salt, expected.length, { N: n, r, p, maxmem: 256 * n * r + 1024 * 1024 });
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
