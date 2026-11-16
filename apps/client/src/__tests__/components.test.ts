import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import type { StateView } from '@game/game-core';
import type { ClientCommandType } from '@game/protocol';
import ActionButtons from '../components/ActionButtons.vue';
import Hud from '../components/Hud.vue';
import TurnOrder from '../components/TurnOrder.vue';
import TurnTimer from '../components/TurnTimer.vue';
import { turnOrder } from '../game/view';
import { pid, playingView, setupView } from './helpers';

const NAMES: Record<string, string> = { a: 'Alice', b: 'Bob', c: 'Cy' };
const nameOf = (id: string): string => NAMES[id] ?? id;
const colorOf = (): string => '#fff';

describe('TurnTimer', () => {
  const text = (deadline: number | null, now: number): string => mount(TurnTimer, { props: { deadline, now } }).text();

  it('mid-turn reconnect: shows the time to the server deadline, not a full turn', () => {
    expect(text(1_000_000 + 12_400, 1_000_000)).toBe('13 s');
  });

  it('continuation: follows a replaced deadline', async () => {
    const wrapper = mount(TurnTimer, { props: { deadline: 1_003_000, now: 1_000_000 } });
    expect(wrapper.text()).toBe('3 s');
    await wrapper.setProps({ deadline: 1_020_000 });
    expect(wrapper.text()).toBe('20 s');
    await wrapper.setProps({ now: 1_001_500 });
    expect(wrapper.text()).toBe('19 s');
  });

  it('past deadline: 0 s', () => {
    expect(text(1_000_000, 1_000_001)).toBe('0 s');
    expect(text(1_000_000, 2_000_000)).toBe('0 s');
  });

  it('shows no time without a deadline', () => {
    expect(text(null, 1_000_000)).toBe('–');
  });
});

describe('TurnOrder', () => {
  const render = (view: StateView) =>
    mount(TurnOrder, { props: { entries: turnOrder(view), me: 'a', nameOf, colorOf } }).findAll('[data-test="order-entry"]');

  it('playing: lists the order and marks the active player', () => {
    const rows = render(playingView(['b', 'a', 'c'], { owner: 'a' }));
    expect(rows.map((r) => r.find('[data-test="order-name"]').text())).toEqual(['Bob', 'Alice', 'Cy']);
    expect(rows.map((r) => r.attributes('data-active'))).toEqual(['false', 'true', 'false']);
    expect(rows[1]!.text()).toContain('you');
  });

  it('setup: lists groups best first and marks ties and rolls', () => {
    const rows = render(setupView(['a', 'b', 'c'], { groups: [['c'], ['a', 'b']], roller: 'b', rolls: { a: 4 } }));
    expect(rows.map((r) => r.find('[data-test="order-name"]').text())).toEqual(['Cy', 'Alice', 'Bob']);
    expect(rows.map((r) => r.find('[data-test="tied"]').exists())).toEqual([false, true, true]);
    expect(rows[1]!.find('[data-test="tied"]').text()).toBe('tied');
    expect(rows[1]!.find('[data-test="order-roll"]').text()).toBe('rolled 4');
    expect(rows[2]!.attributes('data-active')).toBe('true');
  });

  it('setup before any split: the group of everyone is marked as undecided, not as a tie', () => {
    const rows = render(setupView(['a', 'b']));
    expect(rows.map((r) => r.find('[data-test="tied"]').text())).toEqual(['order undecided', 'order undecided']);
  });

  it('marks a jailed player, labelled as the interim rule', () => {
    const rows = render(playingView(['a', 'b'], { jail: { b: { attemptsUsed: 2 } } }));
    expect(rows[0]!.find('[data-test="jail"]').exists()).toBe(false);
    expect(rows[1]!.find('[data-test="jail"]').text()).toMatch(/in jail, 2 attempts used \(interim rule\)/);
  });
});

describe('ActionButtons', () => {
  it('disables per availability and emits the command type', async () => {
    const wrapper = mount(ActionButtons, { props: { available: { RollForOrder: false, RollDice: true, EndTurn: false, Resign: false, BuyAsset: false, StartAuction: false, Bid: false, PassAuction: false } } });
    const disabled = (type: string): boolean => wrapper.find(`[data-test="${type}"]`).attributes('disabled') !== undefined;
    expect([disabled('RollForOrder'), disabled('RollDice'), disabled('EndTurn')]).toEqual([true, false, true]);
    await wrapper.find('[data-test="RollDice"]').trigger('click');
    await wrapper.find('[data-test="EndTurn"]').trigger('click');
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
  const enabled = (wrapper: ReturnType<typeof mount>): string[] =>
    ['RollForOrder', 'RollDice', 'EndTurn'].filter(
      (type) => wrapper.find(`[data-test="${type}"]`).attributes('disabled') === undefined,
    );

  it('before and after the roll: first only RollDice, then only EndTurn', async () => {
    const wrapper = mount(Hud, { props: { ...base, view: playingView(['a', 'b'], { owner: 'a' }) } });
    expect(enabled(wrapper)).toEqual(['RollDice']);
    expect(wrapper.find('[data-test="headline"]').text()).toBe('Your turn');
    await wrapper.setProps({ view: playingView(['a', 'b'], { owner: 'a', rolled: true, revision: 10 }) });
    expect(enabled(wrapper)).toEqual(['EndTurn']);
  });

  it('not my turn, pending, offline and past the deadline: nothing enabled', async () => {
    const mine = playingView(['a', 'b'], { owner: 'a', deadline: 60_000 });
    const wrapper = mount(Hud, { props: { ...base, view: playingView(['a', 'b'], { owner: 'b' }) } });
    expect(enabled(wrapper)).toEqual([]);
    expect(wrapper.find('[data-test="headline"]').text()).toBe('Turn: Bob');

    await wrapper.setProps({ view: mine, pending: ['RollDice'] });
    expect(enabled(wrapper)).toEqual([]);
    await wrapper.setProps({ pending: [], connected: false });
    expect(enabled(wrapper)).toEqual([]);
    expect(wrapper.find('[data-test="offline"]').exists()).toBe(true);
    await wrapper.setProps({ connected: true });
    expect(enabled(wrapper)).toEqual(['RollDice']);
    await wrapper.setProps({ now: 60_000 });
    expect(enabled(wrapper)).toEqual([]);
    expect(wrapper.find('[data-test="timer"]').text()).toBe('0 s');
  });

  it('my order roll: only RollForOrder, with the setup timer', () => {
    const wrapper = mount(Hud, { props: { ...base, view: setupView(['a', 'b'], { roller: 'a', deadline: 62_400 }) } });
    expect(enabled(wrapper)).toEqual(['RollForOrder']);
    expect(wrapper.find('[data-test="timer"]').text()).toBe('13 s');
    expect(wrapper.find('[data-test="headline"]').text()).toBe('Rolling for turn order: You');
  });

  it('shows rejected-command messages and emits commands and dismissals', async () => {
    const wrapper = mount(Hud, {
      props: {
        ...base,
        view: playingView(['a', 'b'], { owner: 'a' }),
        messages: [{ id: 3, code: 'DEADLINE_PASSED', message: 'Turn t7 expired' }],
        problem: 'Unreadable message from the server',
      },
    });
    const message = wrapper.find('[data-test="message"]');
    expect(message.text()).toContain('DEADLINE_PASSED');
    expect(message.text()).toContain('Turn t7 expired');
    expect(wrapper.find('[data-test="problem"]').text()).toContain('Unreadable');
    await message.find('button').trigger('click');
    await wrapper.find('[data-test="RollDice"]').trigger('click');
    expect(wrapper.emitted('dismiss')).toEqual([[3]]);
    expect(wrapper.emitted('command')).toEqual([['RollDice']]);
  });
});
