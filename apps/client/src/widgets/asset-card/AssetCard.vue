<script setup lang="ts">
import { formatMoney } from '../../shared/lib/index';

import { t } from '../../shared/i18n/index';
import { computed, onMounted, onBeforeUnmount } from 'vue';
import { energyRentFor, type BoardCell, type GeneratedBoard, type PlayerId, type StateView } from '@game/game-core';
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
/** Example dice sums for the energy quote; the amounts come from game-core's energyRentFor. */
const ENERGY_EXAMPLES = [2, 7, 12] as const;
const energyExamples = computed(() => {
  const q = quote.value;
  return q?.kind === 'energy' ? ENERGY_EXAMPLES.map(sum => ({ sum, rent: energyRentFor(q, sum) })) : [];
});
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
    <button data-testid="asset-close" :aria-label="t('asset_card.close_asset_card')" @click="emit('close')">{{ t('asset_card.close') }}</button>
    <h2 data-testid="asset-title">{{ cell.asset.name }}</h2>
    <dl>
      <dt>{{ t('asset_card.category') }}</dt><dd>{{ cell.asset.categoryName }}</dd>
      <dt>{{ t('asset_card.group') }}</dt><dd>{{ cell.asset.groupId }}</dd>
      <template v-if="cell.asset.rank !== null"><dt>{{ t('asset_card.rank') }}</dt><dd>{{ cell.asset.rank }}</dd></template>
      <dt>{{ t('asset_card.owner') }}</dt><dd data-testid="asset-owner">{{ owner ?? t('asset_card.free') }}</dd>
      <dt>{{ t('asset_card.price') }}</dt><dd>{{ formatMoney(cell.asset.price) }}</dd>
      <dt>{{ t('asset_card.cell') }}</dt><dd>{{ cell.index }}</dd>
      <template v-if="cell.kind === 'monopoly' && view"><dt>{{ t('asset_card.houses') }}</dt><dd data-testid="asset-houses">{{ t('asset_card.4', { value0: houses }) }}</dd></template>
      <template v-if="terms"><dt>{{ t('asset_card.mortgage') }}</dt><dd data-testid="asset-mortgage">{{ t('asset_card.mortgaged_advance_laps', { value0: formatMoney(terms.advance), value1: terms.remainingLaps }) }}</dd>
        <dt>{{ t('asset_card.lap_waits_for') }}</dt><dd data-testid="asset-mortgage-pending">{{ pendingNames || t('asset_card.nobody') }}</dd></template>
      <template v-if="quote?.kind === 'fixed'"><dt>{{ t('common.rent') }}</dt><dd data-testid="asset-rent">{{ formatMoney(quote.amount) }}</dd></template>
    </dl>
    <div v-if="quote?.kind === 'energy'" data-testid="asset-energy">
      <p>{{ t('asset_card.rent_q_dice', { value0: formatMoney(quote.sumPrices), value1: quote.holdings, value2: quote.groupSize }) }}</p>
      <p data-testid="energy-examples">
        <template v-for="(example, i) in energyExamples" :key="example.sum">{{ t('asset_card.dice', { value0: i ? ', ' : '', value1: example.sum, value2: formatMoney(example.rent) }) }}</template>
      </p>
    </div>
    <p v-if="settlement" data-testid="asset-settlement">{{ t('asset_card.open_rent', { value0: formatMoney(settlement.amount) }) }}<template v-if="settlement.kind === 'energy'"> {{ t('common.dice_sum', { value0: settlement.diceSum }) }}</template></p>
    <div v-if="controls" data-testid="house-controls">
      <p v-if="buildsLeft !== null" class="note" data-testid="builds-left">{{ t('asset_card.builds_left_this', { value0: buildsLeft }) }}</p>
      <div class="house-control">
        <button data-testid="build-house" :disabled="!controls.build.enabled" @click="send('BuildHouse')">{{ t('asset_card.build_a_house', { value0: formatMoney(controls.build.cost) }) }}</button>
        <span v-if="controls.build.reason" class="reason" data-testid="build-reason">{{ controls.build.reason }}</span>
      </div>
      <div class="house-control">
        <button data-testid="sell-house" :disabled="!controls.sell.enabled" @click="send('SellHouse')">{{ t('asset_card.sell_a_house', { value0: formatMoney(controls.sell.refund) }) }}</button>
        <span v-if="controls.sell.reason" class="reason" data-testid="sell-reason">{{ controls.sell.reason }}</span>
      </div>
    </div>
    <div v-if="mortgage" data-testid="mortgage-controls">
      <div class="house-control">
        <button data-testid="mortgage" :disabled="!mortgage.mortgage.enabled" @click="send('Mortgage')">{{ t('asset_card.mortgage_2', { value0: formatMoney(mortgage.mortgage.advance) }) }}</button>
        <span v-if="mortgage.mortgage.reason" class="reason" data-testid="mortgage-reason">{{ mortgage.mortgage.reason }}</span>
      </div>
      <div class="house-control">
        <button data-testid="redeem" :disabled="!mortgage.redeem.enabled" @click="send('Redeem')">{{ t('asset_card.redeem', { value0: formatMoney(mortgage.redeem.amount) }) }}</button>
        <span v-if="mortgage.redeem.reason" class="reason" data-testid="redeem-reason">{{ mortgage.redeem.reason }}</span>
      </div>
    </div>
    <h3>{{ t('asset_card.other_group_members') }}</h3>
    <ul><li data-testid="asset-group-member" :data-cell="other.index" v-for="other in others" :key="other.index">{{ t('asset_card.cell_2', { value0: other.asset!.name, value1: formatMoney(other.asset!.price), value2: other.index }) }}</li></ul>
  </section>
</template>
