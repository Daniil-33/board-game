import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createTestDatabase } from './helpers/db.js';

const SERVER_DIR = fileURLToPath(new URL('../../', import.meta.url));
const TSX = fileURLToPath(new URL('../../node_modules/.bin/tsx', import.meta.url));

interface Run {
  readonly exit: Promise<number | null>;
  readonly lines: () => string[];
  kill(signal: NodeJS.Signals): void;
  waitFor(pattern: RegExp, timeoutMs?: number): Promise<string>;
}

function run(env: Record<string, string>): Run {
  const child = spawn(TSX, ['src/main.ts'], {
    cwd: SERVER_DIR,
    env: { PATH: process.env['PATH'] ?? '', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (d) => (output += d));
  child.stderr.on('data', (d) => (output += d));
  const exit = new Promise<number | null>((resolve) => child.on('exit', (code) => resolve(code)));
  return {
    exit,
    lines: () => output.split('\n').filter(Boolean),
    kill: (signal) => child.kill(signal),
    async waitFor(pattern, timeoutMs = 20_000) {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const line = output.split('\n').find((l) => pattern.test(l));
        if (line !== undefined) return line;
        if (Date.now() > deadline || child.exitCode !== null) throw new Error(`no line matching ${pattern}; output:\n${output}`);
        await new Promise((r) => setTimeout(r, 50));
      }
    },
  };
}

// spec: server/service
describe('service process', () => {
  it('exits 1 naming DATABASE_URL when it is missing', async () => {
    const proc = run({});
    expect(await proc.exit).toBe(1);
    expect(proc.lines().join('\n')).toContain('DATABASE_URL');
  }, 30_000);

  it.each(['production', 'development', ''])('refuses explicit test entropy before DB access in mode %s', async (mode) => {
    const proc = run({ NODE_ENV: mode, E2E_TEST_SEED: '', DATABASE_URL: 'postgres://unreachable', PORT: '0' });
    expect(await proc.exit).toBe(1);
    expect(proc.lines().join('\n')).toContain('E2E_TEST_SEED requires NODE_ENV=test');
    expect(proc.lines().join('\n')).not.toContain('database migrated');
    expect(proc.lines().join('\n')).not.toContain('server listening');
  }, 30_000);

  it.each(['production', 'staging', 'development', ''])('refuses fixtures before DB access in mode %s', async mode => {
    const proc = run({ NODE_ENV: mode, E2E_FIXTURES: '1', DATABASE_URL: 'postgres://unreachable', PORT: '0' });
    expect(await proc.exit).toBe(1);
    expect(proc.lines().join('\n')).toContain('E2E_FIXTURES requires NODE_ENV=test');
    expect(proc.lines().join('\n')).not.toContain('database migrated');
    expect(proc.lines().join('\n')).not.toContain('server listening');
  }, 30_000);

  it.each([undefined, 'abc123'])('migrates before health is reachable, binds locally, exits cleanly (SHA %j)', async (sha) => {
    const test = await createTestDatabase({ migrate: false });
    try {
      const proc = run({ DATABASE_URL: test.url, PORT: '0', ...(sha ? { GIT_SHA: sha } : {}) });
      const listening = JSON.parse(await proc.waitFor(/server listening/)) as { address: string };
      expect(listening.address).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
      expect(proc.lines().join('\n')).toContain('0002_lobby');
      expect(proc.lines().findIndex((line) => line.includes('database migrated'))).toBeLessThan(proc.lines().findIndex((line) => line.includes('server listening')));
      const health = await fetch(`${listening.address}/api/health`);
      expect(health.status).toBe(200);
      expect(await health.json()).toEqual({ status: 'ok', sha: sha ?? 'unknown' });
      expect((await fetch(`${listening.address}/api/rooms`)).status).toBe(401);
      proc.kill('SIGTERM');
      expect(await proc.exit).toBe(0);
    } finally {
      await test.drop();
    }
  }, 30_000);
});
