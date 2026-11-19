<script setup lang="ts">
import { Button } from '../../shared/ui/index';
import { formatMoney, logoMonogram, logoUrl } from '../../shared/lib/index';

import { t } from '../../shared/i18n/index';
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue';
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
const logoFailed = ref(false);
watch(() => props.cell.asset?.assetId, () => { logoFailed.value = false; });
const logo = computed(() => props.cell.asset ? logoUrl(props.cell.asset.assetId, { dark: false }) : null);
const groupGradient = computed(() => `var(--group-${props.cell.asset?.groupId?.toLowerCase() ?? 'm1'})`);
const groupMembers = computed(() => props.board.cells
  .filter(cell => cell.asset?.groupId === props.cell.asset?.groupId && cell.asset !== null)
  .map(cell => {
    const asset = cell.asset!;
    const ownerId = props.view?.owners[asset.assetId];
    return {
      cell, asset, current: cell.index === props.cell.index,
      owner: ownerId ? props.nameOf?.(ownerId) ?? ownerId : cell.index === props.cell.index ? props.owner ?? t('asset_card.free') : t('asset_card.free'),
      houses: props.view?.houses[asset.assetId] ?? 0,
    };
  }));
const assetId = computed(() => props.cell.asset?.assetId);
const houses = computed(() => (assetId.value === undefined ? 0 : props.view?.houses[assetId.value] ?? 0));
const owned = computed(() => assetId.value !== undefined && props.view?.owners[assetId.value] !== undefined);
const quote = computed(() => (owned.value && assetId.value !== undefined ? props.view?.rentQuotes[assetId.value] ?? null : null));
const schedule = computed(() => assetId.value === undefined ? [] : rentTiers(props.board, assetId.value));
const scheduleRows = computed(() => {
  if (schedule.value[0]?.kind === 'regular') return schedule.value.map(tier => ({
    key: `regular-${tier.kind === 'regular' && tier.completeGroup ? 'group' : tier.kind === 'regular' ? tier.houses : 0}`,
    label: tier.kind === 'regular' ? (tier.houses === 0 && tier.completeGroup ? t('asset_card.rent_tier_complete_group') : t('asset_card.rent_tier_houses', { houses: tier.houses }, tier.houses)) : '',
    amount: tier.kind === 'regular' ? tier.amount : 0,
    percent: props.cell.asset ? Math.max(5, Math.round(((tier.kind === 'regular' ? tier.amount : 0) * 100 / props.cell.asset.price) / 5) * 5) : 0,
  }));
  if (schedule.value[0]?.kind === 'logistics') return schedule.value.map(tier => ({
    key: `logistics-${tier.kind === 'logistics' ? tier.holdings : 0}`,
    label: tier.kind === 'logistics' ? t('asset_card.rent_tier_holdings', { holdings: tier.holdings }, tier.holdings) : '',
    amount: tier.kind === 'logistics' ? tier.amount : 0,
    percent: props.cell.asset ? Math.max(5, Math.round(((tier.kind === 'logistics' ? tier.amount : 0) * 100 / props.cell.asset.price) / 5) * 5) : 0,
  }));
  return [];
});
const energyRows = computed(() => {
  if (schedule.value[0]?.kind !== 'energy') return [];
  return [...new Set(schedule.value.filter((tier): tier is Extract<RentTier, { kind: 'energy' }> => tier.kind === 'energy').map(tier => tier.holdings))]
    .map(holdings => ({ holdings, tiers: schedule.value.filter((tier): tier is Extract<RentTier, { kind: 'energy' }> => tier.kind === 'energy' && tier.holdings === holdings) }));
});
const rentTierHeader = computed(() => schedule.value[0]?.kind === 'regular'
  ? t('asset_card.rent_tier_header')
  : t('asset_card.rent_tier_holdings_header'));
function energyPriceRange(rates: readonly Extract<RentTier, { kind: 'energy' }>[]): string {
  const price = props.cell.asset?.price ?? 0;
  if (!price || !rates.length) return '0%';
  const percentages = rates.map(rate => Math.round(rate.amount * 100 / price));
  return `${Math.min(...percentages)}–${Math.max(...percentages)}%`;
}
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
  <section v-if="cell.asset" class="asset-card asset-inspection" :style="{ '--asset-gradient': groupGradient }" :aria-label="t('asset_card.asset_details')" data-testid="asset-card">
    <Button class="asset-close" data-testid="asset-close" :aria-label="t('asset_card.close_asset_card')" @click="emit('close')">{{ t('asset_card.close') }}</Button>
    <header class="asset-header">
      <div class="asset-header-band"></div>
      <img v-if="logo && !logoFailed" class="asset-logo" :src="logo" alt="" data-testid="asset-logo" @error="logoFailed = true">
      <span v-else class="asset-logo asset-monogram" data-testid="asset-logo-fallback" aria-hidden="true">{{ logoMonogram(cell.asset.assetId) || cell.asset.name.slice(0, 2) }}</span>
      <div class="asset-heading"><p>{{ t('asset_card.category_price', { category: cell.asset.categoryName, price: formatMoney(cell.asset.price) }) }}<template v-if="cell.asset.rank !== null"> {{ t('asset_card.group_separator') }} {{ t('asset_card.rank') }} {{ cell.asset.rank }}</template></p><h2 data-testid="asset-title">{{ cell.asset.name }}</h2></div>
    </header>
    <section class="asset-group" data-testid="asset-group">
      <h3>{{ t('asset_card.group_line', { group: cell.asset.groupId }) }}</h3>
      <ul class="group-chips"><li v-for="member in groupMembers" :key="member.asset.assetId" :data-testid="member.current ? 'asset-current-group-member' : 'asset-group-member'" :data-cell="member.cell.index" :class="{ current: member.current }">
        <strong>{{ member.asset.name }}</strong>
        <small class="member-reference">{{ t('asset_card.group_member', { name: member.asset.name, price: formatMoney(member.asset.price), cell: member.cell.index }) }}</small>
        <small><span :data-testid="member.current ? 'asset-owner' : undefined">{{ member.owner }}</span><template v-if="member.cell.kind === 'monopoly'"><span> {{ t('asset_card.group_separator') }} </span><span :data-testid="member.current ? 'asset-houses' : undefined">{{ t('asset_card.house_count', { houses: member.houses }) }}</span></template></small>
      </li></ul>
    </section>
    <div v-if="scheduleRows.length" class="rent-table-scroll"><table class="rent-table" data-testid="asset-rent-table">
      <caption>{{ t('asset_card.rent_table') }}</caption>
      <thead><tr><th scope="col">{{ rentTierHeader }}</th><th scope="col">{{ t('asset_card.price_percent') }}</th><th scope="col">{{ t('asset_card.rent_amount') }}</th></tr></thead>
      <tbody><tr v-for="row in scheduleRows" :key="row.key" :data-testid="'rent-tier-' + row.key" :aria-current="highlightedTier === row.key ? 'true' : undefined">
        <th scope="row">{{ row.label }}</th><td>{{ t('asset_card.price_percent_value', { percent: row.percent }) }}</td><td :data-testid="highlightedTier === row.key && quote?.kind === 'fixed' ? 'asset-rent' : undefined">{{ formatMoney(row.amount) }}</td>
      </tr></tbody>
    </table></div>
    <p v-if="quote?.kind === 'fixed' && quote.amount === 0" class="asset-current-rent" data-testid="asset-current-rent"><small>{{ t('common.rent') }}</small><strong data-testid="asset-rent">{{ formatMoney(quote.amount) }}</strong></p>
    <div v-if="energyRows.length" class="rent-table-scroll"><table class="rent-table energy-table" data-testid="asset-rent-table">
      <caption>{{ t('asset_card.rent_table_energy') }}</caption>
      <thead><tr><th scope="col">{{ t('asset_card.rent_tier_holdings_header') }}</th><th v-for="sum in 11" :key="sum">{{ sum + 1 }}</th><th scope="col">{{ t('asset_card.price_percent') }}</th></tr></thead>
      <tbody><tr v-for="row in energyRows" :key="row.holdings" :data-testid="'rent-tier-energy-' + row.holdings" :aria-current="highlightedTier === `energy-${row.holdings}` ? 'true' : undefined">
        <th scope="row">{{ row.holdings }}</th><td v-for="sum in row.tiers" :key="sum.diceSum">{{ formatMoney(sum.amount) }}</td><td>{{ t('asset_card.price_percent_range', { range: energyPriceRange(row.tiers) }) }}</td>
      </tr></tbody>
    </table></div>
    <div v-if="quote?.kind === 'energy'" data-testid="asset-energy">
      <p>{{ t('asset_card.energy_formula', { sumPrices: formatMoney(quote.sumPrices), holdings: quote.holdings, groupSize: quote.groupSize }) }}</p>
      <p data-testid="energy-examples">{{ energyExampleText }}</p>
    </div>
    <p v-if="settlement" data-testid="asset-settlement">{{ settlement.kind === 'energy' ? t('asset_card.energy_settlement', { amount: formatMoney(settlement.amount), diceSum: settlement.diceSum }) : t('asset_card.settlement', { amount: formatMoney(settlement.amount) }) }}</p>
    <div v-if="controls || mortgage || terms" class="asset-summary" data-testid="asset-terms">
      <div v-if="controls"><small>{{ t('asset_card.house_cost') }}</small><strong>{{ formatMoney(controls.build.cost) }}</strong></div>
      <div v-if="mortgage || terms"><small>{{ t('asset_card.mortgage_advance') }}</small><strong>{{ formatMoney(mortgage?.mortgage.advance ?? terms!.advance) }}</strong><small v-if="terms" data-testid="asset-mortgage">{{ t('asset_card.mortgage_terms', { advance: formatMoney(terms.advance), laps: terms.remainingLaps }, terms.remainingLaps) }}</small><small v-if="terms">{{ t('asset_card.lap_waits_for') }}</small><small v-if="terms" data-testid="asset-mortgage-pending">{{ pendingNames || t('asset_card.nobody') }}</small></div>
    </div>
    <p v-if="controls && buildsLeft !== null" class="note" data-testid="builds-left">{{ t('asset_card.builds_remaining', { builds: buildsLeft }) }}</p>
    <div v-if="controls || mortgage" class="asset-actions" data-testid="asset-actions">
      <div v-if="controls" class="action-contents" data-testid="house-controls">
        <div class="asset-action"><Button variant="primary" data-testid="build-house" :disabled="!controls.build.enabled" @click="send('BuildHouse')">{{ t('asset_card.build_action', { cost: formatMoney(controls.build.cost) }) }}</Button><small v-if="controls.build.reason" class="reason" data-testid="build-reason">{{ controls.build.reason }}</small></div>
        <div class="asset-action"><Button data-testid="sell-house" :disabled="!controls.sell.enabled" @click="send('SellHouse')">{{ t('asset_card.sell_action', { refund: formatMoney(controls.sell.refund) }) }}</Button><small v-if="controls.sell.reason" class="reason" data-testid="sell-reason">{{ controls.sell.reason }}</small></div>
      </div>
      <div v-if="mortgage" class="action-contents" data-testid="mortgage-controls">
        <div class="asset-action"><Button data-testid="mortgage" :disabled="!mortgage.mortgage.enabled" @click="send('Mortgage')">{{ t('asset_card.mortgage_action', { advance: formatMoney(mortgage.mortgage.advance) }) }}</Button><small v-if="mortgage.mortgage.reason" class="reason" data-testid="mortgage-reason">{{ mortgage.mortgage.reason }}</small></div>
        <div class="asset-action"><Button data-testid="redeem" :disabled="!mortgage.redeem.enabled" @click="send('Redeem')">{{ t('asset_card.redeem_action', { amount: formatMoney(mortgage.redeem.amount) }) }}</Button><small v-if="mortgage.redeem.reason" class="reason" data-testid="redeem-reason">{{ mortgage.redeem.reason }}</small></div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.asset-inspection { position: relative; overflow: hidden; background: var(--bg-deep); }
.asset-inspection .rent-table { width: 100%; table-layout: auto; }
.asset-current-rent { display: flex; justify-content: space-between; margin: 0; padding: var(--space-2); border-radius: var(--design-radius-md); background: var(--surface-1); }
.asset-current-rent small { color: var(--text-muted); }
.asset-header { position: relative; margin: calc(var(--space-4) * -1) calc(var(--space-4) * -1) var(--space-2); padding-top: 24px; }
.asset-header-band { height: 40px; border-radius: var(--design-radius-md) var(--design-radius-md) 0 0; background: var(--asset-gradient); }
.asset-header img, .asset-monogram { position: absolute; top: 14px; left: var(--space-3); z-index: 1; width: 52px; height: 52px; flex: none; object-fit: contain; border-radius: var(--design-radius-md); background: var(--light-0); }
.asset-monogram { display: grid; place-items: center; background: var(--light-0); color: var(--ink-primary); font-weight: 700; }
.asset-heading { min-height: 60px; padding: 21px 72px var(--space-2); border-radius: 0 0 var(--design-radius-md) var(--design-radius-md); background: var(--gradient-card-light); color: var(--ink-primary); }
.asset-header p, .asset-header h2 { margin: 0; }
.asset-header p { color: var(--ink-secondary); font-size: .8rem; }
.asset-header h2 { color: var(--ink-primary); }
.asset-close { position: absolute; top: var(--space-2); right: var(--space-2); z-index: 1; }
.asset-group h3 { margin: 0 0 var(--space-2); }
.group-chips { display: flex; flex-wrap: wrap; gap: var(--space-2); margin: 0; padding: 0; list-style: none; }
.group-chips li { display: grid; gap: 2px; min-width: 120px; padding: var(--space-2); border: 1px solid var(--border-strong); border-radius: var(--design-radius-lg); background: var(--surface-1); }
.group-chips li.current { border-color: var(--highlight); box-shadow: inset 3px 0 var(--highlight); }
.group-chips small, .asset-summary small, .asset-action .reason { color: var(--text-muted); }
.group-chips .member-reference { font-size: .72rem; }
.asset-summary { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-2); }
.asset-summary > div { display: grid; align-content: start; gap: var(--space-1); padding: var(--space-2); background: var(--surface-1); border-radius: var(--design-radius-md); }
.asset-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-2); }
.action-contents { display: contents; }
.asset-action { display: grid; align-content: start; gap: var(--space-1); min-width: 0; }
.asset-action :deep(button) { width: 100%; }
.asset-action .reason { font-size: .8rem; overflow-wrap: anywhere; }
.rent-table { border-collapse: collapse; }
.rent-table-scroll { max-width: 100%; overflow-x: auto; }
.rent-table th, .rent-table td { padding: var(--space-1) var(--space-2); border-bottom: 1px solid var(--border-subtle); text-align: right; }
.rent-table th:first-child { text-align: left; }
.rent-table [aria-current="true"] { color: var(--highlight); background: var(--surface-1); font-weight: 700; }
.rent-table [aria-current="true"] th { border-inline-start: 3px solid var(--highlight); }
@media (max-width: 600px) {
  .asset-heading { padding-left: 68px; }
  .asset-actions { gap: var(--space-1); }
  .asset-actions :deep(button) { font-size: .82rem; padding-inline: var(--space-1); }
  .asset-inspection .rent-table { font-size: .82rem; }
  .asset-inspection .rent-table th, .asset-inspection .rent-table td { padding-inline: var(--space-1); }
}
</style>
