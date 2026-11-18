<script setup lang="ts">
import { Button } from '../../shared/ui/index';
import { formatMoney } from '../../shared/lib/index';

import { t } from '../../shared/i18n/index';
import { computed, onMounted, onBeforeUnmount } from 'vue';
import { energyRentFor, rentTiers, type BoardCell, type GeneratedBoard, type PlayerId, type RentTier, type StateView } from '@game/game-core';
import type { ClientCommandType } from '@game/protocol';
import { houseControls } from '../../entities/game/index';
import { mortgageControls, mortgageTerms } from '../../entities/game/index';
import type { AssetCommandType, Intent } from '../../entities/game/index';
const props = defineProps<{
  cell: BoardCell; board: GeneratedBoard; owner?: string | undefined;
  /** The current server view; houses, quote and controls follow it. */
  view?: StateView | null;
  me?: PlayerId | null; connected?: boolean; pending?: readonly ClientCommandType[]; now?: number;
  /** Display names for the players still pending in a mortgage lap. */
  nameOf?: (id: string) => string;
}>();
const emit = defineEmits<{ close: []; command: [intent: Intent] }>();
const others = computed(() => props.board.cells.filter(c => c.index !== props.cell.index && c.asset?.groupId === props.cell.asset?.groupId));
const assetId = computed(() => props.cell.asset?.assetId);
const houses = computed(() => (assetId.value === undefined ? 0 : props.view?.houses[assetId.value] ?? 0));
const owned = computed(() => assetId.value !== undefined && props.view?.owners[assetId.value] !== undefined);
const quote = computed(() => (owned.value && assetId.value !== undefined ? props.view?.rentQuotes[assetId.value] ?? null : null));
const schedule = computed(() => assetId.value === undefined ? [] : rentTiers(props.board, assetId.value));
const scheduleRows = computed(() => {
  if (schedule.value[0]?.kind === 'regular') return schedule.value.map(tier => ({
    key: `regular-${tier.kind === 'regular' && tier.completeGroup ? 'group' : tier.kind === 'regular' ? tier.houses : 0}`,
    label: tier.kind === 'regular' ? (tier.houses === 0 && tier.completeGroup ? t('asset_card.rent_tier_complete_group') : t('asset_card.rent_tier_houses', { houses: tier.houses })) : '',
    amount: tier.kind === 'regular' ? tier.amount : 0,
  }));
  if (schedule.value[0]?.kind === 'logistics') return schedule.value.map(tier => ({
    key: `logistics-${tier.kind === 'logistics' ? tier.holdings : 0}`,
    label: tier.kind === 'logistics' ? t('asset_card.rent_tier_holdings', { holdings: tier.holdings }) : '',
    amount: tier.kind === 'logistics' ? tier.amount : 0,
  }));
  return [];
});
const energyRows = computed(() => {
  if (schedule.value[0]?.kind !== 'energy') return [];
  return [...new Set(schedule.value.filter((tier): tier is Extract<RentTier, { kind: 'energy' }> => tier.kind === 'energy').map(tier => tier.holdings))]
    .map(holdings => ({ holdings, tiers: schedule.value.filter((tier): tier is Extract<RentTier, { kind: 'energy' }> => tier.kind === 'energy' && tier.holdings === holdings) }));
});
const highlightedTier = computed(() => {
  if (!props.view || !assetId.value || !owned.value) return null;
  const owner = props.view.owners[assetId.value];
  const group = props.board.cells.filter(cell => cell.asset?.groupId === props.cell.asset?.groupId && cell.asset);
  if (props.cell.kind === 'monopoly') {
    const complete = group.every(cell => props.view!.owners[cell.asset!.assetId] === owner);
    const houseCount = props.view.houses[assetId.value] ?? 0;
    const key = houseCount === 0 && complete ? 'regular-group' : `regular-${houseCount}`;
    const currentQuote = props.view.rentQuotes[assetId.value];
    const row = scheduleRows.value.find(item => item.key === key);
    return currentQuote?.kind === 'fixed' && row?.amount === currentQuote.amount ? key : null;
  }
  if (props.cell.kind === 'logistics') {
    const fixedQuote = quote.value?.kind === 'fixed' ? quote.value : null;
    const quoted = schedule.value.find((tier): tier is Extract<RentTier, { kind: 'logistics' }> => tier.kind === 'logistics' && tier.amount === fixedQuote?.amount);
    return fixedQuote && quoted ? `logistics-${quoted.holdings}` : null;
  }
  return quote.value?.kind === 'energy' ? `energy-${quote.value.holdings}` : null;
});
/** Example dice sums for the energy quote; the amounts come from game-core's energyRentFor. */
const ENERGY_EXAMPLES = [2, 7, 12] as const;
const energyExamples = computed(() => {
  const q = quote.value;
  return q?.kind === 'energy' ? ENERGY_EXAMPLES.map(sum => ({ sum, rent: energyRentFor(q, sum) })) : [];
});
const energyExampleText = computed(() => energyExamples.value.map(({ sum, rent }) => t('asset_card.energy_example', { diceSum: sum, rent: formatMoney(rent) })).join(', '));
const settlement = computed(() => (props.view?.rent?.assetId === assetId.value ? props.view?.rent ?? null : null));
const actionContext = computed(() => (props.view === undefined ? null : { view: props.view, me: props.me ?? null, connected: props.connected ?? false, pending: props.pending ?? [], now: props.now ?? 0 }));
const controls = computed(() => (assetId.value === undefined || actionContext.value === null ? null : houseControls(actionContext.value, assetId.value)));
const mortgage = computed(() => (assetId.value === undefined || actionContext.value === null ? null : mortgageControls(actionContext.value, assetId.value)));
const terms = computed(() => mortgageTerms(props.view, assetId.value));
const pendingNames = computed(() => terms.value?.pending.map(id => props.nameOf?.(id) ?? id).join(', ') ?? '');
const buildsLeft = computed(() => (props.me != null && props.view?.turn?.playerId === props.me ? props.view.turn.quotas.builds : null));
function send(type: AssetCommandType): void {
  if (assetId.value !== undefined) emit('command', { type, payload: { assetId: assetId.value } });
}
function keydown(event: KeyboardEvent): void { if (event.key === 'Escape') emit('close'); }
onMounted(() => window.addEventListener('keydown', keydown));
onBeforeUnmount(() => window.removeEventListener('keydown', keydown));
</script>
<template>
  <section v-if="cell.asset" class="asset-card" :aria-label="t('asset_card.asset_details')" data-testid="asset-card">
    <Button data-testid="asset-close" :aria-label="t('asset_card.close_asset_card')" @click="emit('close')">{{ t('asset_card.close') }}</Button>
    <h2 data-testid="asset-title">{{ cell.asset.name }}</h2>
    <dl>
      <dt>{{ t('asset_card.category') }}</dt><dd>{{ cell.asset.categoryName }}</dd>
      <dt>{{ t('asset_card.group') }}</dt><dd>{{ cell.asset.groupId }}</dd>
      <template v-if="cell.asset.rank !== null"><dt>{{ t('asset_card.rank') }}</dt><dd>{{ cell.asset.rank }}</dd></template>
      <dt>{{ t('asset_card.owner') }}</dt><dd data-testid="asset-owner">{{ owner ?? t('asset_card.free') }}</dd>
      <dt>{{ t('asset_card.price') }}</dt><dd>{{ formatMoney(cell.asset.price) }}</dd>
      <dt>{{ t('asset_card.cell') }}</dt><dd>{{ cell.index }}</dd>
      <template v-if="cell.kind === 'monopoly' && view"><dt>{{ t('asset_card.houses') }}</dt><dd data-testid="asset-houses">{{ t('asset_card.house_count', { houses: houses }) }}</dd></template>
      <template v-if="terms"><dt>{{ t('asset_card.mortgage') }}</dt><dd data-testid="asset-mortgage">{{ t('asset_card.mortgage_terms', { advance: formatMoney(terms.advance), laps: terms.remainingLaps }) }}</dd>
        <dt>{{ t('asset_card.lap_waits_for') }}</dt><dd data-testid="asset-mortgage-pending">{{ pendingNames || t('asset_card.nobody') }}</dd></template>
      <template v-if="quote?.kind === 'fixed'"><dt>{{ t('common.rent') }}</dt><dd data-testid="asset-rent">{{ formatMoney(quote.amount) }}</dd></template>
    </dl>
    <table v-if="scheduleRows.length" class="rent-table" data-testid="asset-rent-table">
      <caption>{{ t('asset_card.rent_table') }}</caption>
      <tbody><tr v-for="row in scheduleRows" :key="row.key" :data-testid="'rent-tier-' + row.key" :aria-current="highlightedTier === row.key ? 'true' : undefined">
        <th scope="row">{{ row.label }}</th><td>{{ formatMoney(row.amount) }}</td>
      </tr></tbody>
    </table>
    <table v-else-if="energyRows.length" class="rent-table" data-testid="asset-rent-table">
      <caption>{{ t('asset_card.rent_table_energy') }}</caption>
      <thead><tr><th scope="col">{{ t('asset_card.rent_tier_holdings_header') }}</th><th v-for="sum in 11" :key="sum">{{ sum + 1 }}</th></tr></thead>
      <tbody><tr v-for="row in energyRows" :key="row.holdings" :data-testid="'rent-tier-energy-' + row.holdings" :aria-current="highlightedTier === `energy-${row.holdings}` ? 'true' : undefined">
        <th scope="row">{{ row.holdings }}</th><td v-for="sum in row.tiers" :key="sum.diceSum">{{ formatMoney(sum.amount) }}</td>
      </tr></tbody>
    </table>
    <div v-if="quote?.kind === 'energy'" data-testid="asset-energy">
      <p>{{ t('asset_card.energy_formula', { sumPrices: formatMoney(quote.sumPrices), holdings: quote.holdings, groupSize: quote.groupSize }) }}</p>
      <p data-testid="energy-examples">{{ energyExampleText }}</p>
    </div>
    <p v-if="settlement" data-testid="asset-settlement">{{ settlement.kind === 'energy' ? t('asset_card.energy_settlement', { amount: formatMoney(settlement.amount), diceSum: settlement.diceSum }) : t('asset_card.settlement', { amount: formatMoney(settlement.amount) }) }}</p>
    <div v-if="controls" data-testid="house-controls">
      <p v-if="buildsLeft !== null" class="note" data-testid="builds-left">{{ t('asset_card.builds_remaining', { builds: buildsLeft }) }}</p>
      <div class="house-control">
        <Button data-testid="build-house" :disabled="!controls.build.enabled" @click="send('BuildHouse')">{{ t('asset_card.build_action', { cost: formatMoney(controls.build.cost) }) }}</Button>
        <span v-if="controls.build.reason" class="reason" data-testid="build-reason">{{ controls.build.reason }}</span>
      </div>
      <div class="house-control">
        <Button data-testid="sell-house" :disabled="!controls.sell.enabled" @click="send('SellHouse')">{{ t('asset_card.sell_action', { refund: formatMoney(controls.sell.refund) }) }}</Button>
        <span v-if="controls.sell.reason" class="reason" data-testid="sell-reason">{{ controls.sell.reason }}</span>
      </div>
    </div>
    <div v-if="mortgage" data-testid="mortgage-controls">
      <div class="house-control">
        <Button data-testid="mortgage" :disabled="!mortgage.mortgage.enabled" @click="send('Mortgage')">{{ t('asset_card.mortgage_action', { advance: formatMoney(mortgage.mortgage.advance) }) }}</Button>
        <span v-if="mortgage.mortgage.reason" class="reason" data-testid="mortgage-reason">{{ mortgage.mortgage.reason }}</span>
      </div>
      <div class="house-control">
        <Button data-testid="redeem" :disabled="!mortgage.redeem.enabled" @click="send('Redeem')">{{ t('asset_card.redeem_action', { amount: formatMoney(mortgage.redeem.amount) }) }}</Button>
        <span v-if="mortgage.redeem.reason" class="reason" data-testid="redeem-reason">{{ mortgage.redeem.reason }}</span>
      </div>
    </div>
    <h3>{{ t('asset_card.other_group_members') }}</h3>
    <ul><li data-testid="asset-group-member" :data-cell="other.index" v-for="other in others" :key="other.index">{{ t('asset_card.group_member', { name: other.asset!.name, price: formatMoney(other.asset!.price), cell: other.index }) }}</li></ul>
  </section>
</template>
