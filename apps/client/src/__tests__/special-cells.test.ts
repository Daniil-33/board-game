import { h } from 'vue';
import { afterEach, describe, expect, it } from 'vitest';
import { casinoCap, jailFee, type StateView } from '@game/game-core';
import { canIssue, mortgageControls } from '../entities/game/index';
import { canIssueSpecial } from '../widgets/special-cells/availability';
import { CasinoPanel, ChargePanel, JailChoice } from '../widgets/special-cells/index';
import { AssetCard } from '../widgets/asset-card/index';
import { withUi, pid, playingView } from './helpers';
import { flushPromises, mount, enableAutoUnmount } from '@vue/test-utils';

enableAutoUnmount(afterEach);
const nameOf = (id: string) => id === 'a' ? 'Alice' : 'Bob';
const context = (view: StateView) => ({ view, me: pid('a'), connected: true, pending: [], now: 50_000 });
const jailView = (over: { rolled?: boolean; cash?: number } = {}) => {
  const view = playingView(['a', 'b'], { owner: 'a', rolled: over.rolled ?? false, jail: { a: { attemptsUsed: 1 } } });
  const fee = jailFee(view.economy);
  return { ...view, balances: { ...view.balances, a: (over.cash ?? fee + 100) as never } };
};
const casinoView = (over: { cap?: number; cash?: number; rent?: boolean; charge?: boolean } = {}) => {
  const view = playingView(['a', 'b'], { owner: 'a' });
  return {
    ...view,
    casino: { playerId: pid('a'), turnId: view.turn!.turnId, cap: (over.cap ?? casinoCap(view.economy)) as never },
    balances: { ...view.balances, a: (over.cash ?? view.balances.a!) as never },
    ...(over.rent ? { rent: { payerId: pid('a'), ownerId: pid('b'), assetId: view.board!.cells[1]!.asset!.assetId, cell: 1, kind: 'regular' as const, amount: 20 as never, diceSum: null } } : {}),
    ...(over.charge ? { charge: { payerId: pid('a'), amount: 20 as never, cause: 'chance' as const } } : {}),
  };
};
const chargeView = () => ({ ...playingView(['a', 'b'], { owner: 'a' }), charge: { payerId: pid('a'), amount: 20 as never, cause: 'chance' as const } });

describe('stage 6 action gating', () => {
  it('shows jail choice only before the own roll and disables fee payment below the fee', () => {
    expect(canIssueSpecial({ ...context(jailView()), me: pid('a') }, 'PayJailFee')).toBe(true);
    expect(canIssueSpecial({ ...context(jailView({ cash: jailFee(playingView(['a', 'b']).economy) - 10 })), me: pid('a') }, 'PayJailFee')).toBe(false);
    expect(canIssueSpecial({ ...context(jailView({ rolled: true })), me: pid('a') }, 'PayJailFee')).toBe(false);
    expect(canIssueSpecial({ ...context(playingView(['a', 'b'], { owner: 'b', jail: { a: { attemptsUsed: 1 } } })), me: pid('a') }, 'PayJailFee')).toBe(false);
  });

  it('disables a casino bet below 10 and during rent or a charge while keeping decline available', () => {
    const low = casinoView({ cap: 0, cash: 0 });
    expect(canIssueSpecial({ ...context(low), me: pid('a') }, 'PlaceCasinoBet')).toBe(false);
    expect(canIssueSpecial({ ...context(low), me: pid('a') }, 'DeclineCasino')).toBe(true);
    for (const view of [casinoView({ rent: true }), casinoView({ charge: true })]) {
      expect(canIssueSpecial({ ...context(view), me: pid('a') }, 'PlaceCasinoBet')).toBe(false);
      expect(canIssueSpecial({ ...context(view), me: pid('a') }, 'DeclineCasino')).toBe(true);
    }
  });

  it('allows the open bank charge payment only for its payer', () => {
    expect(canIssueSpecial({ ...context(chargeView()), me: pid('a') }, 'PayCharge')).toBe(true);
    expect(canIssueSpecial({ ...context(chargeView()), me: pid('b') }, 'PayCharge')).toBe(false);
  });

  it('preserves the redeem lock reason and keeps mortgage and sale available during a charge', () => {
    const view = playingView(['a', 'b'], { owner: 'a', rolled: true });
    const asset = view.board!.cells.find(cell => cell.asset)?.asset!;
    const locked = { ...view, owners: { [asset.assetId]: pid('a') }, mortgages: { [asset.assetId]: { advance: 100 as never, lapsCompleted: 0, remainingLaps: 1, pending: [], lockedTurnId: view.turn!.turnId } } } as StateView;
    const result = mortgageControls({ ...context(locked), me: pid('a') }, asset.assetId)!;
    expect(result.redeem.code).toBe('REDEEM_LOCKED');
    expect(result.redeem.reason).toBe('Выкуп доступен со следующего хода');
    const group = [view.board!.cells[1]!.asset!, view.board!.cells[3]!.asset!];
    const logistics = view.board!.cells[5]!.asset!;
    const mortgagedLogistics = view.board!.cells[15]!.asset!;
    const charged = { ...view, owners: Object.fromEntries([...group, logistics, mortgagedLogistics].map(item => [item.assetId, pid('a')])),
      houses: { [group[0]!.assetId]: 1, [group[1]!.assetId]: 1 },
      mortgages: { [mortgagedLogistics.assetId]: { advance: 100 as never, lapsCompleted: 0, remainingLaps: 8, pending: [], lockedTurnId: null } },
      charge: { payerId: pid('a'), amount: 20 as never, cause: 'chance' as const } } as StateView;
    const card = mount(AssetCard, { props: { cell: charged.board!.cells[1]!, board: charged.board!, owner: 'Alice', ...context(charged), me: pid('a'), nameOf } });
    expect(card.get('[data-testid="build-house"]').attributes('disabled')).toBeDefined();
    expect(card.get('[data-testid="build-reason"]').text()).toContain('Сначала оплатите обязательный сбор банку');
    expect(card.get('[data-testid="sell-house"]').attributes('disabled')).toBeUndefined();
    const logisticsCard = mount(AssetCard, { props: { cell: charged.board!.cells[5]!, board: charged.board!, owner: 'Alice', ...context(charged), me: pid('a'), nameOf } });
    expect(logisticsCard.get('[data-testid="mortgage"]').attributes('disabled')).toBeUndefined();
    const lockedCard = mount(AssetCard, { props: { cell: charged.board!.cells[15]!, board: charged.board!, owner: 'Alice', ...context(charged), me: pid('a'), nameOf } });
    expect(lockedCard.get('[data-testid="redeem"]').attributes('disabled')).toBeDefined();
    expect(lockedCard.get('[data-testid="redeem-reason"]').text()).toContain('Сначала оплатите обязательный сбор банку');
  });
});

describe('stage 6 buttons send their commands', () => {
  it('jail choice sends RollDice and PayJailFee', async () => {
    const wrapper = mount(withUi(() => h(JailChoice, { view: jailView(), me: pid('a'), connected: true, pending: [], now: 50_000 })), { attachTo: document.body });
    await wrapper.get('[data-testid="jail-roll"]').trigger('click');
    await wrapper.get('[data-testid="jail-pay-fee"]').trigger('click');
    expect(wrapper.findComponent(JailChoice).emitted('command')).toEqual([['RollDice'], ['PayJailFee']]);
  });

  it('shows disabled reasons for a poor jail-fee payer and a casino with no legal bet', () => {
    const jail = jailView({ cash: jailFee(playingView(['a', 'b']).economy) - 10 });
    const jailWrapper = mount(withUi(() => h(JailChoice, { view: jail, me: pid('a'), connected: true, pending: [], now: 50_000 })));
    expect(jailWrapper.get('[data-testid="jail-pay-fee"]').attributes('disabled')).toBeDefined();
    expect(jailWrapper.get('[data-testid="jail-fee-reason"]').text()).toContain('Недостаточно денег');
    const casino = mount(withUi(() => h(CasinoPanel, { view: casinoView({ cash: 0, cap: 0 }), me: pid('a'), connected: true, pending: [], now: 50_000, nameOf })));
    expect(casino.get('[data-testid="casino-bet"]').attributes('disabled')).toBeDefined();
    expect(casino.get('[data-testid="casino-bet-reason"]').text()).toBe('Недостаточно денег для ставки.');
    expect(casino.get('[data-testid="casino-decline"]').attributes('disabled')).toBeUndefined();
  });

  it('casino controls send PlaceCasinoBet with its amount and DeclineCasino', async () => {
    const wrapper = mount(withUi(() => h(CasinoPanel, { view: casinoView({ cash: 20 }), me: pid('a'), connected: true, pending: [], now: 50_000, nameOf })), { attachTo: document.body });
    await wrapper.get('[data-testid="casino-increment"]').trigger('click');
    expect((wrapper.get('[data-testid="casino-amount"]').element as HTMLInputElement).value).toBe('20');
    expect(wrapper.get('[data-testid="casino-increment"]').attributes('disabled')).toBeDefined();
    await wrapper.get('[data-testid="casino-amount"]').setValue('27');
    await wrapper.get('[data-testid="casino-amount"]').trigger('change');
    await wrapper.get('[data-testid="casino-bet"]').trigger('click');
    await wrapper.get('[data-testid="casino-decline"]').trigger('click');
    expect(wrapper.findComponent(CasinoPanel).emitted('command')).toEqual([[{ type: 'PlaceCasinoBet', payload: { amount: 20 } }], ['DeclineCasino']]);
  });

  it('charge control sends PayCharge', async () => {
    const wrapper = mount(withUi(() => h(ChargePanel, { view: chargeView(), me: pid('a'), connected: true, pending: [], now: 50_000, nameOf })), { attachTo: document.body });
    await wrapper.get('[data-testid="pay-charge"]').trigger('click');
    expect(wrapper.findComponent(ChargePanel).emitted('command')).toEqual([['PayCharge']]);
    await flushPromises();
  });
});
