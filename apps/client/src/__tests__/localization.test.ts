import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import type { Money } from '@game/game-core';
import { RentPanel } from '../widgets/rent-panel/index';
import { playingView, pid } from './helpers';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import vueParser from 'vue-eslint-parser';
import ts from 'typescript-eslint';
import { i18n, messages, t } from '../shared/i18n/index';
import { formatMoney, formatSeconds, formatTime } from '../shared/lib/index';
import russian from '../shared/i18n/locales/ru.json';
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
      if (node.type === 'VAttribute' && ((!node.directive && node.key.name === 'keypath') || (node.directive && node.key.argument?.name === 'keypath'))) {
        function collectKey(expression: Record<string, any>): void {
          if (expression.type === 'ConditionalExpression') {
            collectKey(expression.consequent); collectKey(expression.alternate);
          } else {
            expect(expression.type, `${file}: component keypaths must be literal`).toBe('Literal');
            used.add(expression.value);
          }
        }
        if (node.directive) collectKey(node.value.expression);
        else used.add(node.value.value);
      }
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
  it('discovers both locales and defaults and falls back to Russian', () => {
    expect(Object.keys(messages).sort()).toEqual(['en', 'ru']);
    expect(i18n.global.locale.value).toBe('ru');
    expect(i18n.global.fallbackLocale.value).toBe('ru');
    expect(t('login.nickname')).toBe('Ник');
  });
  it('has exact equality between used keys and both locale definitions', () => {
    const used = inventory();
    expect(difference(used, new Set(flatten(russian)))).toEqual({ missing: [], unused: [] });
    expect(difference(used, new Set(flatten(english)))).toEqual({ missing: [], unused: [] });
  });
  it('detects both missing and unused key probes', () => {
    expect(difference(new Set(['used']), new Set(['unused']))).toEqual({ missing: ['used'], unused: ['unused'] });
  });
  it('reorders a complete rich rent sentence while retaining the emphasized amount', async () => {
    const view = playingView(['a', 'b']);
    const cell = view.board!.cells.find(cell => cell.asset !== null)!;
    const rent = { payerId: pid('a'), ownerId: pid('b'), assetId: cell.asset!.assetId, cell: cell.index, kind: 'energy' as const, amount: 120 as Money, diceSum: 7 };
    const wrapper = mount(RentPanel, { props: { view: { ...view, rent }, me: pid('a'), connected: true, pending: [], now: 0, nameOf: id => id === 'a' ? 'Alice' : 'Bob' } });
    expect(wrapper.get('[data-testid="rent-line"]').text()).toBe(`Alice должен игроку Bob 120 за «${cell.asset!.name}» (сумма костей 7).`);
    i18n.global.setLocaleMessage('fr', { rent_panel: { energy_sentence: '{asset} : {amount}; {owner} ← {payer}; {diceSum}' } });
    i18n.global.locale.value = 'fr';
    try {
      await nextTick();
      expect(wrapper.get('[data-testid="rent-line"]').text()).toBe(`${cell.asset!.name} : 120; Bob ← Alice; 7`);
      expect(wrapper.get('[data-testid="rent-amount"]').text()).toBe('120');
      expect(wrapper.get('[data-testid="rent-amount"]').element.tagName).toBe('STRONG');
    } finally { i18n.global.locale.value = 'ru'; wrapper.unmount(); }
  });
  it('preserves integer money, countdown and UTC timestamp fixtures', () => {
    expect([0, 10, 123450, -10].map(formatMoney)).toEqual(['0', '10', '123\u2009450', '-10']);
    i18n.global.locale.value = 'en';
    try { expect(formatMoney(123450)).toBe('123,450'); }
    finally { i18n.global.locale.value = 'ru'; }
    expect(formatSeconds(9)).toBe('9');
    expect(formatTime(Date.UTC(2026, 0, 2, 0, 3, 4, 567))).toBe('02.01.2026, 00:03:04 UTC');
    expect(formatTime(NaN)).toBe('NaN');
  });
});
