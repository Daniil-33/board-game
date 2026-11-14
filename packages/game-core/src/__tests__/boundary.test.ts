import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const FORBIDDEN = [
  'Math.random',
  'Date.now',
  'new Date(',
  'fetch(',
  "from 'fs'",
  "from 'node:fs'",
  "from 'net'",
  "from 'node:net'",
  "from 'http'",
  "from 'node:http'",
  'process.env',
];

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(__dirname, '..');

// Every non-test .ts file under src/, so new modules are covered automatically.
function collectSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== '__tests__') out.push(...collectSourceFiles(full));
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      out.push(full);
    }
  }
  return out.sort();
}

const SOURCE_FILES = collectSourceFiles(srcDir).map((f) => relative(srcDir, f));

describe('game-core boundary: no I/O or global entropy in source', () => {
  it('finds the core source files', () => {
    expect(SOURCE_FILES).toEqual(expect.arrayContaining(['index.ts', 'engine.ts', 'types.ts']));
  });

  for (const file of SOURCE_FILES) {
    const filePath = join(srcDir, file);
    const content = readFileSync(filePath, 'utf-8');

    for (const forbidden of FORBIDDEN) {
      it(`${file} does not contain "${forbidden}"`, () => {
        expect(content).not.toContain(forbidden);
      });
    }
  }
});
