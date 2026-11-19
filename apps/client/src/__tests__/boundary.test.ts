import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const srcDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sources(full);
    return /\.(ts|vue)$/.test(entry.name) ? [full] : [];
  });
}

const FILES = sources(srcDir).map((file) => ({ name: relative(srcDir, file), text: readFileSync(file, 'utf8') }));

/** The pure constants and display/legality helpers the client may take from game-core. Everything else must be `import type`. */
const ALLOWED_VALUES = ['CLASSIC_40', 'MIN_PLAYERS', 'MAX_PLAYERS', 'SETUP_ROLL_TARGET_KIND', 'TURN_TARGET_KIND', 'AUCTION_RESPONSE_TARGET_KIND', 'AUCTION_RESPONSE_MS', 'nextBidAmount', 'buildLegality', 'saleLegality', 'houseCost', 'houseRefund', 'energyRentFor', 'rentTiers', 'mortgageAdvance', 'mortgageLegality', 'redeemLegality'];

describe('client boundary', () => {
  it('finds the client sources', () => {
    expect(FILES.map((f) => f.name)).toEqual(expect.arrayContaining(['app/main.ts', 'app/App.vue', 'shared/api/connection.ts']));
  });

  it('imports only types, constants and display helpers from game-core, never transition logic', () => {
    const imported: string[] = [];
    for (const { name, text } of FILES) {
      for (const match of text.matchAll(/import\s+(type\s+)?([^;]*?)\s+from\s+'@game\/game-core'/g)) {
        if (match[1] !== undefined) continue;
        const clause = match[2]!;
        expect(clause, `${name}: only named imports from game-core`).toMatch(/^\{[\s\S]*\}$/);
        for (const part of clause.slice(1, -1).split(',')) {
          const item = part.trim();
          if (item === '' || item.startsWith('type ')) continue;
          imported.push(item);
          expect(ALLOWED_VALUES, `${name} imports the value "${item}" from game-core`).toContain(item);
        }
      }
      expect(text, `${name}: no dynamic or namespace import of game-core`).not.toMatch(
        /import\(\s*'@game\/game-core'|\*\s+as\s+\w+\s+from\s+'@game\/game-core'|require\('@game\/game-core'/,
      );
    }
    expect(imported).toContain('CLASSIC_40');
  });

  it('never names an actor, and has no local turn length', () => {
    for (const { name, text } of FILES) {
      expect(text, `${name} sets an actor`).not.toMatch(/\bactor\s*:/);
      expect(text, `${name} uses a game-core duration`).not.toMatch(/TURN_DURATION_MS|SETUP_ROLL_DURATION_MS|CONTINUATION_MS|45[_]?000/);
      expect(text, `${name} imports the mock`).not.toMatch(/from\s+'[^']*mock\//);
    }
  });

  it('decodes server frames in exactly one place', () => {
    const users = FILES.filter((f) => f.text.includes('decodeServerFrame(')).map((f) => f.name);
    expect(users).toEqual(['shared/api/connection.ts']);
    const parsers = FILES.filter((f) => /JSON\.parse\(/.test(f.text)).map((f) => f.name);
    expect(parsers).toEqual(['entities/session/session.ts']);
  });
});
