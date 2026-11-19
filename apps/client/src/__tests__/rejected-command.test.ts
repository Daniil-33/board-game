import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import type { ClientCommandType } from '@game/protocol';
import type { HudMessage } from '../entities/game/index';
import { rejectedCommandCopy } from '../entities/game/rejected-command';
import { i18n } from '../shared/i18n/index';
import { HudStatus } from '../widgets/turn-header/index';

const commands: readonly [ClientCommandType, string][] = [
  ['RollForOrder', 'Нельзя бросить кость за порядок'],
  ['RollDice', 'Нельзя бросить кости'],
  ['EndTurn', 'Нельзя завершить ход'],
  ['Resign', 'Нельзя сдаться'],
  ['BuyAsset', 'Нельзя купить актив'],
  ['StartAuction', 'Нельзя начать аукцион'],
  ['Bid', 'Нельзя сделать ставку'],
  ['PassAuction', 'Нельзя отказаться от аукциона'],
  ['PayRent', 'Нельзя оплатить ренту'],
  ['BuildHouse', 'Нельзя построить дом'],
  ['SellHouse', 'Нельзя продать дом'],
  ['Mortgage', 'Нельзя заложить актив'],
  ['Redeem', 'Нельзя выкупить актив'],
];

function message(overrides: Partial<HudMessage> = {}): HudMessage {
  return { id: 1, code: 'UNKNOWN_CODE', message: 'server supplied text', commandType: 'BuildHouse', ...overrides };
}

describe('rejected command copy', () => {
  it.each(commands)('gives %s its localized action title', (commandType, title) => {
    expect(rejectedCommandCopy(message({ commandType })).title).toBe(title);
  });

  it('uses the translated house reason without protocol or server text in the HUD', () => {
    const rejection = message({ code: 'BUILD_QUOTA_USED' });
    const wrapper = mount(HudStatus, { props: { fatal: null, connected: true, problem: null, messages: [rejection] } });
    const row = wrapper.get('[data-testid="message"]');

    expect(row.text()).toBe('Нельзя построить дом — Дом уже построен в этом ходу.×');
    expect(row.attributes('data-code')).toBe('BUILD_QUOTA_USED');
    expect(row.text()).not.toContain(rejection.code);
    expect(row.text()).not.toContain(rejection.message);
  });

  it('uses a retry fallback for unknown codes and never exposes the code or server message', () => {
    const rejection = message({ code: 'UNMAPPED_PROTOCOL_CODE' });
    expect(rejectedCommandCopy(rejection)).toEqual({ title: 'Нельзя построить дом', reason: 'Попробуйте ещё раз.' });

    const wrapper = mount(HudStatus, { props: { fatal: null, connected: true, problem: null, messages: [rejection] } });
    const row = wrapper.get('[data-testid="message"]');
    expect(row.text()).toContain('Нельзя построить дом — Попробуйте ещё раз.');
    expect(row.text()).not.toContain(rejection.code);
    expect(row.text()).not.toContain(rejection.message);
  });

  it('shows both reconnect lines in the HUD', () => {
    const wrapper = mount(HudStatus, { props: { fatal: null, connected: false, problem: null, messages: [] } });
    expect(wrapper.get('[data-testid="offline"]').text()).toBe('Соединение потеряно, переподключаемся…Партия продолжается, таймеры идут');
  });

  it('localizes rejection and reconnect feedback in English', () => {
    i18n.global.locale.value = 'en';
    try {
      expect(rejectedCommandCopy(message({ code: 'BUILD_QUOTA_USED' }))).toEqual({
        title: "Can't build a house",
        reason: 'You have already built a house this turn.',
      });
      const wrapper = mount(HudStatus, { props: { fatal: null, connected: false, problem: null, messages: [] } });
      expect(wrapper.get('[data-testid="offline"]').text()).toBe('Connection lost. Reconnecting…The game continues, and timers keep running');
    } finally {
      i18n.global.locale.value = 'ru';
    }
  });
});
