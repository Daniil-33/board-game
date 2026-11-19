import { DOMWrapper, enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { actionAvailability } from '../entities/game/index';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Revision, StateView } from '@game/game-core';
import type { ClientCommandType } from '@game/protocol';
import { ActionButtons } from '../features/turn-actions/index';
import { Hud } from '../widgets/turn-header/index';
import { TurnOrder } from '../widgets/turn-header/index';
import { TurnTimer } from '../widgets/turn-header/index';
import { turnOrder } from '../entities/game/index';
import { pid, playingView, setupView } from './helpers';

enableAutoUnmount(afterEach);
const body = new DOMWrapper(document.body);

const NAMES: Record<string, string> = { a: 'Alice', b: 'Bob', c: 'Cy' };
const nameOf = (id: string): string => NAMES[id] ?? id;
const colorOf = (): string => '#fff';

describe('TurnTimer', () => {
  const text = (deadline: number | null, now: number): string => mount(TurnTimer, { props: { deadline, now } }).text();

  it('mid-turn reconnect: shows the time to the server deadline, not a full turn', () => {
    expect(text(1_000_000 + 12_400, 1_000_000)).toBe('13 с');
  });

  it('continuation: follows a replaced deadline', async () => {
    const wrapper = mount(TurnTimer, { props: { deadline: 1_003_000, now: 1_000_000 } });
    expect(wrapper.text()).toBe('3 с');
    await wrapper.setProps({ deadline: 1_020_000 });
    expect(wrapper.text()).toBe('20 с');
    await wrapper.setProps({ now: 1_001_500 });
    expect(wrapper.text()).toBe('19 с');
  });

  it('past deadline: 0 s', () => {
    expect(text(1_000_000, 1_000_001)).toBe('0 с');
    expect(text(1_000_000, 2_000_000)).toBe('0 с');
  });

  it('shows no time without a deadline', () => {
    expect(text(null, 1_000_000)).toBe('–');
  });
});

describe('TurnOrder', () => {
  const render = (view: StateView) =>
    mount(TurnOrder, { props: { entries: turnOrder(view), me: 'a', nameOf, colorOf } }).findAll('[data-testid="order-entry"]');

  it('playing: lists the order and marks the active player', () => {
    const rows = render(playingView(['b', 'a', 'c'], { owner: 'a' }));
    expect(rows.map((r) => r.find('[data-testid="order-name"]').text())).toEqual(['Bob', 'Alice', 'Cy']);
    expect(rows.map((r) => r.attributes('data-active'))).toEqual(['false', 'true', 'false']);
    expect(rows[1]!.text()).toContain('вы');
  });

  it('setup: lists groups best first and marks ties and rolls', () => {
    const rows = render(setupView(['a', 'b', 'c'], { groups: [['c'], ['a', 'b']], roller: 'b', rolls: { a: 4 } }));
    expect(rows.map((r) => r.find('[data-testid="order-name"]').text())).toEqual(['Cy', 'Alice', 'Bob']);
    expect(rows.map((r) => r.find('[data-testid="tied"]').exists())).toEqual([false, true, true]);
    expect(rows[1]!.find('[data-testid="tied"]').text()).toBe('ничья');
    expect(rows[1]!.find('[data-testid="order-roll"]').text()).toBe('выпало 4');
    expect(rows[2]!.attributes('data-active')).toBe('true');
  });

  it('setup before any split: the group of everyone is marked as undecided, not as a tie', () => {
    const rows = render(setupView(['a', 'b']));
    expect(rows.map((r) => r.find('[data-testid="tied"]').text())).toEqual(['порядок не определён', 'порядок не определён']);
  });

  it('marks a jailed player, labelled as the interim rule', () => {
    const rows = render(playingView(['a', 'b'], { jail: { b: { attemptsUsed: 2 } } }));
    expect(rows[0]!.find('[data-testid="jail"]').exists()).toBe(false);
    expect(rows[1]!.find('[data-testid="jail"]').text()).toMatch(/в тюрьме, использовано попыток: 2 \(временное правило\)/);
  });
});

describe('ActionButtons', () => {
  it('disables per availability and emits the command type', async () => {
    const wrapper = mount(ActionButtons, { props: { available: actionAvailability({ view: playingView(['a', 'b']), me: pid('a'), connected: true, pending: [], now: 50_000 }) } });
    const disabled = (type: string): boolean => wrapper.find(`[data-testid="${type}"]`).attributes('disabled') !== undefined;
    expect([disabled('RollForOrder'), disabled('RollDice'), disabled('EndTurn')]).toEqual([true, false, true]);
    await wrapper.find('[data-testid="RollDice"]').trigger('click');
    await wrapper.find('[data-testid="EndTurn"]').trigger('click');
    expect(wrapper.emitted('command')).toEqual([['RollDice']]);
  });
});

describe('Hud', () => {
  const base = {
    me: pid('a'),
    connected: true,
    pending: [] as ClientCommandType[],
    now: 50_000,
    messages: [],
    problem: null,
    fatal: null,
    nameOf,
    colorOf,
  };
  it('shows the projected turn owner and countdown', async () => {
    const wrapper = mount(Hud, { props: { ...base, view: playingView(['a', 'b'], { owner: 'b', deadline: 60_000 }) } });
    expect(wrapper.get('[data-testid="headline"]').text()).toBe('Ход: Bob');
    await wrapper.setProps({ view: playingView(['a', 'b'], { owner: 'a', deadline: 60_000 }), now: 60_000 });
    expect(wrapper.get('[data-testid="headline"]').text()).toBe('Ваш ход');
    expect(wrapper.get('[data-testid="timer"]').text()).toBe('0 с');
  });

  it('closes setup on Escape, focuses the opener and allows reopening', async () => {
    const wrapper = mount(Hud, {
      attachTo: document.body,
      props: { ...base, view: setupView(['a', 'b']) },
    });
    const opener = wrapper.get('[data-testid="open-setup"]');
    await vi.waitFor(() => {
      const dialog = body.get('[role="dialog"]');
      expect(dialog.element.contains(document.activeElement)).toBe(true);
    });

    await new DOMWrapper(document.activeElement!).trigger('keydown', { key: 'Escape' });
    await vi.waitFor(() => {
      expect(body.find('[role="dialog"]').exists()).toBe(false);
      expect(document.activeElement).toBe(opener.element);
    });

    await opener.trigger('click');
    expect(body.find('[role="dialog"]').exists()).toBe(true);
    expect(wrapper.emitted('command')).toBeUndefined();
  });

  it('shows current roller, dice and an all-player tie from authoritative setup updates', async () => {
    const wrapper = mount(Hud, { props: { ...base, view: setupView(['a', 'b'], { roller: 'a', deadline: 62_400 }) } });
    await flushPromises();
    const dialog = body.get('[role="dialog"]');
    const roll = dialog.get('[data-testid="RollForOrder"]');
    expect(roll.attributes('disabled')).toBeUndefined();
    expect(dialog.get('[data-testid="timer"]').text()).toBe('13 с');
    expect(dialog.get('[data-testid="headline"]').text()).toBe('Розыгрыш порядка ходов: вы');

    await wrapper.setProps({
      view: setupView(['a', 'b'], { roller: 'b', deadline: 95_000, rolls: { a: 4 } }),
    });
    expect(roll.attributes('disabled')).toBeDefined();
    expect(dialog.get('[data-testid="order-roll"]').text()).toBe('4');
    expect(dialog.get('[data-testid="headline"]').text()).toContain('Bob');
    expect(dialog.get('[data-testid="timer"]').text()).toBe('45 с');

    await wrapper.setProps({
      view: setupView(['a', 'b'], { roller: 'a', revision: 7, deadline: 96_000 }),
      history: [{ revision: 7 as Revision, at: 51_000, events: [
        { type: 'OrderDieRolled', payload: { playerId: pid('a'), value: 4, auto: false } },
        { type: 'OrderDieRolled', payload: { playerId: pid('b'), value: 4, auto: true } },
        { type: 'OrderTied', payload: { playerIds: [pid('a'), pid('b')], value: 4 } },
      ] }],
    });
    expect(roll.attributes('disabled')).toBeUndefined();
    expect(dialog.findAll('[data-testid="tied"]').map(row => row.text())).toEqual(['ничья', 'ничья']);
    expect(dialog.findAll('[data-testid="order-roll"]')).toHaveLength(0);

    await wrapper.setProps({
      view: setupView(['a', 'b'], { roller: 'b', revision: 8, rolls: { a: 5 } }),
    });
    expect(dialog.findAll('[data-testid="order-roll"]').map(row => row.text())).toEqual(['5']);
    expect(dialog.findAll('[data-testid="order-entry"]')[1]!.find('[aria-label="Броска ещё нет"]').exists()).toBe(true);
    expect(roll.attributes('disabled')).toBeDefined();

    await wrapper.setProps({ view: playingView(['b', 'a'], { owner: 'b' }) });
    await vi.waitFor(() => expect(body.find('[role="dialog"]').exists()).toBe(false));
    expect(wrapper.findAll('[data-testid="order-name"]').map(row => row.text())).toEqual(['Bob', 'Alice']);
  });

  it('shows connection messages and emits dismissals', async () => {
    const wrapper = mount(Hud, {
      props: {
        ...base,
        view: playingView(['a', 'b'], { owner: 'a' }),
        messages: [{ id: 3, code: 'DEADLINE_PASSED', message: 'Turn t7 expired' }],
        problem: 'Unreadable message from the server',
      },
    });
    const message = wrapper.find('[data-testid="message"]');
    expect(message.text()).toContain('Действие отклонено — Время хода вышло.');
    expect(message.text()).not.toContain('DEADLINE_PASSED');
    expect(message.text()).not.toContain('Turn t7 expired');
    expect(wrapper.find('[data-testid="problem"]').text()).toContain('Unreadable message from the server');
    await message.find('[data-testid="message-dismiss"]').trigger('click');
    expect(wrapper.emitted('dismiss')).toEqual([[3]]);
  });
});
