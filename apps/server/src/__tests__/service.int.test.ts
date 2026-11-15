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

  it('Default bind: migrates, listens on 127.0.0.1 only, exits 0 on SIGTERM', async () => {
    const test = await createTestDatabase({ migrate: false });
    try {
      const proc = run({ DATABASE_URL: test.url, PORT: '0' });
      const listening = JSON.parse(await proc.waitFor(/server listening/)) as { address: string };
      expect(listening.address).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
      expect(proc.lines().join('\n')).toContain('0002_lobby');
      const health = await fetch(`${listening.address}/api/rooms`);
      expect(health.status).toBe(401);
      proc.kill('SIGTERM');
      expect(await proc.exit).toBe(0);
    } finally {
      await test.drop();
    }
  }, 30_000);
});
