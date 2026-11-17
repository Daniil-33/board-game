<script setup lang="ts">
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
  <section v-if="cell.asset" class="asset-card" aria-label="Asset details" data-test="asset-card">
    <button aria-label="Close asset card" @click="emit('close')">Close</button>
    <h2>{{ cell.asset.name }}</h2>
    <dl>
      <dt>Category</dt><dd>{{ cell.asset.categoryName }}</dd>
      <dt>Group</dt><dd>{{ cell.asset.groupId }}</dd>
      <template v-if="cell.asset.rank !== null"><dt>Rank</dt><dd>{{ cell.asset.rank }}</dd></template>
      <dt>Owner</dt><dd data-test="asset-owner">{{ owner ?? 'free' }}</dd>
      <dt>Price</dt><dd>{{ cell.asset.price }}</dd>
      <dt>Cell</dt><dd>{{ cell.index }}</dd>
      <template v-if="cell.kind === 'monopoly' && view"><dt>Houses</dt><dd data-test="asset-houses">{{ houses }} / 4</dd></template>
      <template v-if="terms"><dt>Mortgage</dt><dd data-test="asset-mortgage">mortgaged, advance {{ terms.advance }}, {{ terms.remainingLaps }} laps left</dd>
        <dt>Lap waits for</dt><dd data-test="asset-mortgage-pending">{{ pendingNames || 'nobody' }}</dd></template>
      <template v-if="quote?.kind === 'fixed'"><dt>Rent</dt><dd data-test="asset-rent">{{ quote.amount }}</dd></template>
    </dl>
    <div v-if="quote?.kind === 'energy'" data-test="asset-energy">
      <p>Rent = Q({{ quote.sumPrices }} × dice sum × {{ quote.holdings }} / (200 × {{ quote.groupSize }}))</p>
      <p data-test="energy-examples">
        <template v-for="(example, i) in energyExamples" :key="example.sum">{{ i ? ', ' : '' }}dice {{ example.sum }}: {{ example.rent }}</template>
      </p>
    </div>
    <p v-if="settlement" data-test="asset-settlement">Open rent: {{ settlement.amount }}<template v-if="settlement.kind === 'energy'"> (dice sum {{ settlement.diceSum }})</template></p>
    <div v-if="controls" data-test="house-controls">
      <p v-if="buildsLeft !== null" class="note" data-test="builds-left">Builds left this turn: {{ buildsLeft }}</p>
      <div class="house-control">
        <button data-test="build-house" :disabled="!controls.build.enabled" @click="send('BuildHouse')">Build a house: {{ controls.build.cost }}</button>
        <span v-if="controls.build.reason" class="reason" data-test="build-reason">{{ controls.build.reason }}</span>
      </div>
      <div class="house-control">
        <button data-test="sell-house" :disabled="!controls.sell.enabled" @click="send('SellHouse')">Sell a house: +{{ controls.sell.refund }}</button>
        <span v-if="controls.sell.reason" class="reason" data-test="sell-reason">{{ controls.sell.reason }}</span>
      </div>
    </div>
    <div v-if="mortgage" data-test="mortgage-controls">
      <div class="house-control">
        <button data-test="mortgage" :disabled="!mortgage.mortgage.enabled" @click="send('Mortgage')">Mortgage: +{{ mortgage.mortgage.advance }}</button>
        <span v-if="mortgage.mortgage.reason" class="reason" data-test="mortgage-reason">{{ mortgage.mortgage.reason }}</span>
      </div>
      <div class="house-control">
        <button data-test="redeem" :disabled="!mortgage.redeem.enabled" @click="send('Redeem')">Redeem: {{ mortgage.redeem.amount }}</button>
        <span v-if="mortgage.redeem.reason" class="reason" data-test="redeem-reason">{{ mortgage.redeem.reason }}</span>
      </div>
    </div>
    <h3>Other group members</h3>
    <ul><li v-for="other in others" :key="other.index">{{ other.asset!.name }} — {{ other.asset!.price }} (cell {{ other.index }})</li></ul>
  </section>
</template>
