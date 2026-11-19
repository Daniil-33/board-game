<script setup lang="ts">
import { Button } from '../../shared/ui/index';
import { formatMoney } from '../../shared/lib/index';

import { Translation as I18nT } from 'vue-i18n';
import { i18n, t } from '../../shared/i18n/index';
import { computed } from 'vue';
import type { PlayerId, StateView } from '@game/game-core';
import type { ClientCommandType } from '@game/protocol';
import { canIssue, type NullPayloadType } from '../../entities/game/index';
const props = defineProps<{ view: StateView; me: PlayerId | null; connected: boolean; pending: readonly ClientCommandType[]; now: number; nameOf: (id: string) => string }>();
const emit = defineEmits<{ command: [type: NullPayloadType]; manageAssets: [] }>();
const asset = computed(() => props.view.board?.cells.find(c => c.asset?.assetId === props.view.rent?.assetId)?.asset);
const paying = computed(() => props.me !== null && props.view.rent?.payerId === props.me && !props.view.eliminated.includes(props.me));
// The projection already contains the payer's current balance. Keep this
// hint view-derived; the server remains authoritative for settlement.
const shortfall = computed(() => props.view.rent === null ? 0 : Math.max(0, props.view.rent.amount - (props.view.balances[props.view.rent.payerId] ?? 0)));
</script>
<template>
  <section v-if="view.rent" class="asset-card decision-panel" :aria-label="t('common.rent')" data-testid="rent">
    <h2>{{ t('rent_panel.rent_due') }}</h2>
    <i18n-t tag="p" data-testid="rent-line" :i18n="i18n.global" :keypath="view.rent.kind === 'energy' ? 'rent_panel.energy_sentence' : 'rent_panel.sentence'">
      <template #payer>{{ nameOf(view.rent.payerId) }}</template>
      <template #owner>{{ nameOf(view.rent.ownerId) }}</template>
      <template #amount><strong data-testid="rent-amount">{{ formatMoney(view.rent.amount) }}</strong></template>
      <template #asset>{{ asset?.name ?? view.rent.assetId }}</template>
      <template #diceSum>{{ view.rent.kind === 'energy' ? view.rent.diceSum : '' }}</template>
    </i18n-t>
    <p v-if="shortfall > 0" class="warn-box" data-testid="rent-shortfall">{{ t('rent_panel.shortfall', { amount: formatMoney(shortfall) }) }}</p>
    <template v-if="paying">
      <Button variant="primary" data-testid="pay-rent" :disabled="!canIssue(props, 'PayRent')" @click="emit('command', 'PayRent')"> {{ t('rent_panel.pay', { amount: formatMoney(view.rent.amount), owner: nameOf(view.rent.ownerId) }) }}
      </Button>
      <Button data-testid="rent-liquidation-entry" @click="emit('manageAssets')">{{ t('rent_panel.manage_assets') }}</Button>
    </template>
  </section>
</template>

<style scoped>
.decision-panel[data-testid="rent"] { display: grid; gap: var(--space-3); border-inline-start: 4px solid var(--danger); background: var(--bg-deep); }
.decision-panel[data-testid="rent"] h2 { margin: 0; font-family: var(--design-font-display); }
[data-testid="rent-line"] { padding: var(--space-3); border-radius: var(--design-radius-lg); background: var(--surface-1); }
[data-testid="rent-amount"] { color: var(--highlight); font-size: 1.25em; }
.warn-box { margin: 0; }
</style>
