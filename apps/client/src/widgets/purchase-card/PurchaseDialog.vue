<script setup lang="ts">
import { formatMoney } from '../../shared/lib/index';

import { t } from '../../shared/i18n/index';
import { computed } from 'vue';
import type { PlayerId, StateView } from '@game/game-core';
import type { ClientCommandType } from '@game/protocol';
import { canIssue, type NullPayloadType } from '../../entities/game/index';
const props = defineProps<{ view: StateView; me: PlayerId | null; connected: boolean; pending: readonly ClientCommandType[]; now: number; nameOf: (id: string) => string }>();
const emit = defineEmits<{ command: [type: NullPayloadType] }>();
const asset = computed(() => props.view.board?.cells.find(c => c.index === props.view.purchase?.cell)?.asset);
const deciding = computed(() => props.view.purchase?.playerId === props.me && props.me !== null && !props.view.eliminated.includes(props.me));
</script>
<template>
  <section v-if="view.purchase" class="asset-card decision-panel" :role="deciding ? 'dialog' : 'status'" :aria-label="t('purchase_dialog.purchase_decision')" data-test="purchase">
    <h2>{{ asset?.name }}</h2>
    <p>{{ t('purchase_dialog.price', { value0: formatMoney(asset?.price) }) }}</p>
    <template v-if="deciding">
      <p>{{ t('purchase_dialog.your_balance', { value0: formatMoney(view.balances[me!]) }) }}</p>
      <button data-test="buy" :disabled="!canIssue(props, 'BuyAsset')" @click="emit('command', 'BuyAsset')">{{ t('purchase_dialog.buy') }}</button>
      <button data-test="start-auction" :disabled="!canIssue(props, 'StartAuction')" @click="emit('command', 'StartAuction')">{{ t('purchase_dialog.start_auction') }}</button>
    </template>
    <p v-else>{{ t('purchase_dialog.is_deciding', { value0: nameOf(view.purchase.playerId) }) }}</p>
  </section>
</template>
