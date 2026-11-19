<script setup lang="ts">
import { Button, ResponsiveDialog } from '../../shared/ui/index';
import { formatMoney, formatSeconds, logoMonogram, logoUrl } from '../../shared/lib/index';

import { t } from '../../shared/i18n/index';
import { computed, ref, watch } from 'vue';
import { rentTiers, type PlayerId, type RentTier, type StateView } from '@game/game-core';
import type { ClientCommandType } from '@game/protocol';
import { canIssue, remainingSeconds, type NullPayloadType } from '../../entities/game/index';
const props = defineProps<{ view: StateView; me: PlayerId | null; connected: boolean; pending: readonly ClientCommandType[]; now: number; nameOf: (id: string) => string }>();
const emit = defineEmits<{ command: [type: NullPayloadType] }>();
const asset = computed(() => props.view.board?.cells.find(c => c.index === props.view.purchase?.cell)?.asset);
const deciding = computed(() => props.view.purchase?.playerId === props.me && props.me !== null && !props.view.eliminated.includes(props.me));
const surfaceOpen = ref(true);
const logoFailed = ref(false);
watch(() => asset.value?.assetId, () => { logoFailed.value = false; });
const logo = computed(() => asset.value ? logoUrl(asset.value.assetId, { dark: false }) : null);
const rentSchedule = computed(() => asset.value ? rentTiers(props.view.board, asset.value.assetId) : []);
const rentRows = computed(() => {
  const tiers = rentSchedule.value;
  if (tiers[0]?.kind === 'regular' || tiers[0]?.kind === 'logistics') return tiers.map(tier => ({
    key: tier.kind === 'regular' ? `regular-${tier.completeGroup ? 'group' : tier.houses}` : `logistics-${tier.holdings}`,
    label: tier.kind === 'regular' ? (tier.houses === 0 && tier.completeGroup ? t('asset_card.rent_tier_complete_group') : t('asset_card.rent_tier_houses', { houses: tier.houses }, tier.houses)) : t('asset_card.rent_tier_holdings', { holdings: tier.holdings }, tier.holdings),
    amount: tier.amount, rates: null as { readonly diceSum: number; readonly amount: number }[] | null,
  }));
  if (tiers[0]?.kind === 'energy') return [...new Set(tiers.map(tier => tier.kind === 'energy' ? tier.holdings : 0))].map(holdings => ({
    key: `energy-${holdings}`,
    label: t('asset_card.rent_tier_holdings', { holdings }, holdings),
    amount: null as number | null,
    rates: tiers.filter((tier): tier is Extract<RentTier, { kind: 'energy' }> => tier.kind === 'energy' && tier.holdings === holdings),
  }));
  return [];
});
const energySums = computed(() => rentRows.value[0]?.rates?.map(rate => rate.diceSum) ?? []);
const disabledReason = (type: NullPayloadType): string => {
  if (!props.connected) return t('hud.connection_lost_reconnecting');
  if (props.pending.includes(type)) return t('hud.waiting');
  if (props.view.turn && props.now >= props.view.turn.deadline) return t('turn_timer.expired');
  if (type === 'BuyAsset' && asset.value && props.me && (props.view.balances[props.me] ?? 0) < asset.value.price) return t('command_reason.insufficient_funds');
  return '';
};
</script>
<template>
  <ResponsiveDialog v-if="view.purchase && deciding" v-model:open="surfaceOpen" :title="t('purchase_dialog.purchase_decision')" :dismissible="false" wide>
  <section class="asset-card decision-panel purchase-card" :style="{ '--asset-gradient': `var(--group-${asset?.groupId?.toLowerCase() ?? 'm1'})` }" :aria-label="t('purchase_dialog.purchase_decision')" data-testid="purchase">
    <header class="purchase-header">
      <img v-if="logo && !logoFailed" :src="logo" :alt="''" data-testid="purchase-logo" @error="logoFailed = true">
      <span v-else class="monogram" data-testid="purchase-logo-fallback" aria-hidden="true">{{ logoMonogram(asset?.assetId ?? '') || asset?.name?.slice(0, 2) }}</span>
      <div><h2>{{ asset?.name }}</h2><p>{{ t('purchase_dialog.price', { price: formatMoney(asset?.price) }) }}</p></div>
    </header>
    <table v-if="rentRows.length" class="rent-table" data-testid="purchase-rent-preview">
      <caption>{{ t('asset_card.rent_table') }}</caption>
      <thead v-if="energySums.length"><tr><th scope="col">{{ t('asset_card.rent_tier_holdings_header') }}</th><th v-for="sum in energySums" :key="sum">{{ sum }}</th></tr></thead>
      <tbody><tr v-for="row in rentRows" :key="row.key"><th scope="row">{{ row.label }}</th><template v-if="row.rates"><td v-for="rate in row.rates" :key="rate.diceSum">{{ formatMoney(rate.amount) }}</td></template><td v-else>{{ formatMoney(row.amount ?? 0) }}</td></tr></tbody>
    </table>
    <p v-if="view.turn" data-testid="purchase-timer">{{ t('common.seconds_remaining', { seconds: formatSeconds(remainingSeconds(view.turn.deadline, now)) }) }}</p>
      <p>{{ t('purchase_dialog.balance', { balance: formatMoney(view.balances[me!]) }) }}</p>
      <Button data-testid="buy" :disabled="!canIssue(props, 'BuyAsset')" :reason="disabledReason('BuyAsset')" @click="emit('command', 'BuyAsset')">{{ t('purchase_dialog.buy') }}</Button>
      <Button data-testid="start-auction" :disabled="!canIssue(props, 'StartAuction')" :reason="disabledReason('StartAuction')" @click="emit('command', 'StartAuction')">{{ t('purchase_dialog.start_auction') }}</Button>
  </section>
  </ResponsiveDialog>
  <section v-else-if="view.purchase" class="asset-card decision-panel purchase-card purchase-status" data-testid="purchase-status">
    <div role="status">
      <h2>{{ t('purchase_dialog.purchase_decision') }}</h2>
      <p class="purchase-status-details"><span>{{ t('purchase_dialog.deciding', { player: nameOf(view.purchase.playerId) }) }}</span><span>{{ asset?.name }}</span><span>{{ formatMoney(asset?.price ?? 0) }}</span></p>
    </div>
    <p v-if="view.turn" aria-live="off" data-testid="purchase-timer">{{ t('common.seconds_remaining', { seconds: formatSeconds(remainingSeconds(view.turn.deadline, now)) }) }}</p>
  </section>
</template>

<style scoped>
.purchase-header { display: flex; align-items: center; gap: var(--space-3); border-radius: var(--design-radius-md); padding: var(--space-3); background: var(--asset-gradient); }
.purchase-header img, .monogram { width: 48px; height: 48px; flex: none; object-fit: contain; }
.monogram { display: grid; place-items: center; border-radius: 8px; color: var(--text-primary); background: var(--surface-1); font-weight: 700; }
.purchase-header h2, .purchase-header p { margin: 0; }
.purchase-status { width: 100%; max-width: 420px; margin-inline: auto; }
.purchase-status-details { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.rent-table { width: 100%; border-collapse: collapse; margin-block: var(--space-3); }
.rent-table th, .rent-table td { padding: var(--space-1) var(--space-2); text-align: right; border-bottom: 1px solid var(--border-subtle); }
.rent-table th { text-align: left; }
</style>
