import { afterEach, describe, expect, it } from 'vitest';
import type { GameEvent } from '@game/game-core';
import { describeEvent } from '../entities/event/describe';
import { i18n } from '../shared/i18n/index';

const nameOf = (id: string) => id === 'a' ? (i18n.global.locale.value === 'ru' ? 'Алиса' : 'Alice') : id;
const assetOf = (id: string) => id;
const text = (type: string, payload: Record<string, unknown>) => describeEvent({ type, payload } as GameEvent, nameOf, assetOf)?.text ?? '';
const chanceCards = [
  ['gain-5', '+5% капитала', '+5% of capital', '+'],
  ['loss-5', '−5% капитала', '−5% of capital', '−'],
  ['gain-10', '+10% капитала', '+10% of capital', '+'],
  ['loss-10', '−10% капитала', '−10% of capital', '−'],
] as const;

afterEach(() => { i18n.global.locale.value = 'ru'; });

describe('stage 6 journal localization', () => {
  it.each(['ru', 'en'] as const)('%s describes every new special-cell event without raw chance ids', locale => {
    i18n.global.locale.value = locale;
    for (const [card, ru, en, signed] of chanceCards) {
      const entry = text('ChanceDrawn', { playerId: 'a', card, amount: 1490 });
      expect(entry).toContain(locale === 'ru' ? ru : en);
      expect(entry).toContain(`${signed}${locale === 'ru' ? '1 490' : '1,490'}`);
      expect(entry).not.toContain(card);
    }
    expect(text('CasinoOffered', { playerId: 'a', cap: 2000 })).toContain(locale === 'ru' ? 'может поставить в казино' : 'may bet up to');
    expect(text('CasinoResolved', { playerId: 'a', amount: 100, won: true })).toContain(locale === 'ru' ? 'выигрывает' : 'wins');
    expect(text('CasinoDeclined', { playerId: 'a', auto: false })).toContain(locale === 'ru' ? 'отказывается' : 'declines');
    expect(text('JailAttemptFailed', { playerId: 'a', attemptsUsed: 2 })).toContain(locale === 'ru' ? 'остаётся в тюрьме' : 'stays in jail');
    expect(text('JailReleased', { playerId: 'a', reason: 'fee' })).toContain(locale === 'ru' ? 'выходит из тюрьмы' : 'leaves jail');
    expect(text('ChargeDue', { payerId: 'a', amount: 100, cause: 'chance' })).toContain(locale === 'ru' ? 'должен банку' : 'owes the bank');
    expect(text('ChargePaid', { payerId: 'a', amount: 100, auto: false })).toContain(locale === 'ru' ? 'платит банку' : 'pays the bank');
    expect(text('ChargePaid', { payerId: 'a', amount: 100, auto: true })).toContain(locale === 'ru' ? 'автоматически' : 'automatically');
  });
});
