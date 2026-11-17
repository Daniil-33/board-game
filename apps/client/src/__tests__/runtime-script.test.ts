// @vitest-environment node
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../../docker-entrypoint.d/40-runtime-config.sh', import.meta.url), 'utf8');
function generate(origin?: string, logoSet?: string) {
  const dir = mkdtempSync(join(tmpdir(), 'runtime-config-'));
  const output = join(dir, 'config.js');
  const script = join(dir, 'entrypoint.sh');
  // Use the production script unchanged except for its output location.
  writeFileSync(script, source.replace('/usr/share/nginx/html/config.js', output));
  const env = {
    PATH: process.env['PATH'],
    PRIVATE_SENTINEL: 'never-expose',
    ...(origin !== undefined ? { API_ORIGIN: origin } : {}),
    ...(logoSet !== undefined ? { LOGO_SET: logoSet } : {}),
  };
  const result = spawnSync('sh', [script], { env, encoding: 'utf8' });
  try {
    return { status: result.status, stderr: result.stderr, text: result.status === 0 ? readFileSync(output, 'utf8') : '' };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

describe('shell runtime config generator', () => {
  it.each(['https://stage-api.focusima.space', 'http://localhost:8787', 'https://a:8443', 'https://a:1', 'https://a:65535', 'https://a:00008', '', undefined])('generates the public config with brand as default for %j', (origin) => {
    const result = generate(origin);
    expect(result.status).toBe(0);
    const context = { window: {} };
    runInNewContext(result.text, context);
    expect(context.window).toEqual({ __GAME_CONFIG__: { API_ORIGIN: origin ?? '', logoSet: 'brand' } });
    expect(result.text).not.toContain('never-expose');
  });
  it.each([
    'https://a/','https://a/path', 'https://user@a', 'https://a?x', 'https://a#x',
    'https://a";alert(1)//', "https://a'", '</script>', 'https://a\nhttps://b',
    'https://a\n', '\nhttps://a', 'https://a b', ' https://a', 'https://a\r',
    'https://a; touch /tmp/runtime-injected', '$(touch /tmp/runtime-injected)',
    'ftp://a', 'https://A', 'https://a:123456', 'https://a:99999', 'https://a:0', 'https://a:65536', 'https://a:00000',
  ])('fails startup naming the variable for %j', (origin) => {
    const result = generate(origin);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('API_ORIGIN');
    expect(result.text).toBe('');
  });
  it.each(['brand', 'geometric'])('publishes the selected %s set', (logoSet) => {
    const result = generate(undefined, logoSet);
    expect(result.status).toBe(0);
    const context = { window: {} };
    runInNewContext(result.text, context);
    expect(context.window).toEqual({ __GAME_CONFIG__: { API_ORIGIN: '', logoSet } });
  });

  it.each(['', 'Brand', 'unknown', 'brand\ngeometric', 'brand";alert(1)//'])('rejects invalid logo set %j', (logoSet) => {
    const result = generate(undefined, logoSet);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('LOGO_SET');
    expect(result.text).toBe('');
  });

  it('is valid POSIX shell', () => {
    execFileSync('sh', ['-n'], { input: source });
  });
});
