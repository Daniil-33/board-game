import { readTestSeed } from './context/test-context.js';

export function fixturesEnabled(env: NodeJS.ProcessEnv): boolean {
  if (env['E2E_FIXTURES'] !== '1') return false;
  if (env['NODE_ENV'] !== 'test') throw new Error('E2E_FIXTURES requires NODE_ENV=test');
  return true;
}

export interface ServiceConfig {
  readonly databaseUrl: string;
  readonly host: string;
  readonly port: number;
  readonly allowedOrigins: readonly string[];
  readonly gitSha: string;
  readonly testSeed: number | undefined;
}

/** Configuration from the environment; throws with the variable's name when it is missing or bad. */
export function readConfig(env: NodeJS.ProcessEnv): ServiceConfig {
  fixturesEnabled(env);
  const testSeed = readTestSeed(env);
  const databaseUrl = env['DATABASE_URL'];
  if (databaseUrl === undefined || databaseUrl === '') throw new Error('DATABASE_URL is required');
  const host = env['HOST'] || '127.0.0.1';
  const portText = env['PORT'] || '8787';
  const port = Number(portText);
  if (!/^[0-9]{1,5}$/.test(portText) || port > 65535) throw new Error(`PORT must be a port number, got "${portText}"`);
  const origins = env['ALLOWED_ORIGINS'];
  const allowedOrigins = !origins ? [] : origins.split(',').map((origin) => origin.trim());
  for (const origin of allowedOrigins) {
    try {
      const url = new URL(origin);
      if (!/^https?:\/\/[a-zA-Z0-9.-]+(?::[0-9]{1,5})?$/.test(origin) || !url.hostname || url.origin !== origin) throw new Error();
    } catch {
      throw new Error('ALLOWED_ORIGINS must contain comma-separated canonical HTTP(S) origins without paths');
    }
  }
  return { databaseUrl, host, port, testSeed, allowedOrigins, gitSha: env['GIT_SHA'] ?? 'unknown' };
}
