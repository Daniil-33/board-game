import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import vueParser from 'vue-eslint-parser';
import ts from 'typescript-eslint';
import { i18n, messages, t } from '../shared/i18n/index';
import { formatMoney, formatSeconds, formatTime } from '../shared/lib/index';
import english from '../shared/i18n/locales/en.json';

const root = resolve(import.meta.dirname, '..');
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? entry.name === '__tests__' ? [] : sources(join(dir, entry.name))
    : /\.(vue|ts)$/.test(entry.name) ? [join(dir, entry.name)] : []);
}
function flatten(value: object, prefix = ''): string[] {
  return Object.entries(value).flatMap(([key, entry]) => typeof entry === 'string' ? [prefix + key] : flatten(entry, prefix + key + '.'));
}
function inventory(): Set<string> {
  const used = new Set<string>();
  for (const file of sources(root)) {
    if (file.includes('/shared/i18n/')) continue;
    const source = readFileSync(file, 'utf8');
    const ast = file.endsWith('.vue')
      ? vueParser.parseForESLint(source, { parser: ts.parser, filePath: file, sourceType: 'module', ecmaVersion: 2022 }).ast
      : (ts.parser.parseForESLint as (code: string, options: object) => { ast: unknown })(source, { filePath: file, sourceType: 'module', ecmaVersion: 2022 }).ast;
    const seen = new Set<object>();
    function visit(value: unknown): void {
      if (!value || typeof value !== 'object' || seen.has(value)) return;
      seen.add(value);
      const node = value as Record<string, any>;
      if (node.type === 'CallExpression' && node.callee?.name === 't') {
        expect(node.arguments[0]?.type, `${file}: translation keys must be literals`).toBe('Literal');
        used.add(node.arguments[0].value);
      }
      for (const [key, child] of Object.entries(node)) if (!['parent', 'tokens', 'comments'].includes(key)) {
        if (Array.isArray(child)) child.forEach(visit); else visit(child);
      }
    }
    visit(ast);
  }
  return used;
}
function difference(used: Set<string>, defined: Set<string>) {
  return { missing: [...used].filter(k => !defined.has(k)), unused: [...defined].filter(k => !used.has(k)) };
}

describe('localization contracts', () => {
  it('discovers JSON locales and falls back from the empty Russian skeleton to English', () => {
    expect(Object.keys(messages).sort()).toEqual(['en', 'ru']);
    expect(i18n.global.locale.value).toBe('en');
    i18n.global.locale.value = 'ru';
    try { expect(t('login.nickname')).toBe('Nickname'); }
    finally { i18n.global.locale.value = 'en'; }
  });
  it('has exact equality between parser-discovered template/TS/map keys and English definitions', () => {
    expect(difference(inventory(), new Set(flatten(english)))).toEqual({ missing: [], unused: [] });
  });
  it('detects both missing and unused key probes', () => {
    expect(difference(new Set(['used']), new Set(['unused']))).toEqual({ missing: ['used'], unused: ['unused'] });
  });
  it('preserves integer money, countdown and UTC timestamp fixtures', () => {
    expect([0, 10, 123450, -10].map(formatMoney)).toEqual(['0', '10', '123450', '-10']);
    expect(formatSeconds(9)).toBe('9');
    expect(formatTime(Date.UTC(2026, 0, 2, 0, 3, 4, 567))).toBe('2026-01-02 00:03:04 UTC');
    expect(formatTime(NaN)).toBe('NaN');
  });
});
