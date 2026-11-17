<script setup lang="ts">
import { formatMoney } from '../../shared/lib/index';

import { t } from '../../shared/i18n/index';
import { computed } from 'vue';
import type { PlayerId, StateView } from '@game/game-core';
import type { ClientCommandType } from '@game/protocol';
import { canIssue, type NullPayloadType } from '../../entities/game/index';
const props = defineProps<{ view: StateView; me: PlayerId | null; connected: boolean; pending: readonly ClientCommandType[]; now: number; nameOf: (id: string) => string }>();
const emit = defineEmits<{ command: [type: NullPayloadType] }>();
const asset = computed(() => props.view.board?.cells.find(c => c.asset?.assetId === props.view.rent?.assetId)?.asset);
const paying = computed(() => props.me !== null && props.view.rent?.payerId === props.me && !props.view.eliminated.includes(props.me));
</script>
<template>
  <section v-if="view.rent" class="asset-card decision-panel" :aria-label="t('common.rent')" data-testid="rent">
    <h2>{{ t('rent_panel.rent_due') }}</h2>
    <p data-testid="rent-line">
      {{ t('rent_panel.owes', { value0: nameOf(view.rent.payerId), value1: nameOf(view.rent.ownerId) }) }} <strong>{{ formatMoney(view.rent.amount) }}</strong> {{ t('rent_panel.for', { value0: asset?.name ?? view.rent.assetId }) }}<template v-if="view.rent.kind === 'energy'"> {{ t('common.dice_sum', { value0: view.rent.diceSum }) }}</template>{{ t('rent_panel.symbol') }} </p>
    <template v-if="paying">
      <button class="primary" data-testid="pay-rent" :disabled="!canIssue(props, 'PayRent')" @click="emit('command', 'PayRent')"> {{ t('rent_panel.pay_rent_to', { value0: formatMoney(view.rent.amount), value1: nameOf(view.rent.ownerId) }) }}
      </button>
    </template>
  </section>
</template>
