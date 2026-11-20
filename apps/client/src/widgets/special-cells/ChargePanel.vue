<script setup lang="ts">
import { computed } from 'vue';
import type { PlayerId, StateView } from '@game/game-core';
import type { ClientCommandType } from '@game/protocol';
import { type ActionContext, type NullPayloadType } from '../../entities/game/index';
import { Button } from '../../shared/ui/index';
import { formatMoney } from '../../shared/lib/index';
import { t } from '../../shared/i18n/index';
import SpecialCellDialog from './SpecialCellDialog.vue';
import { canIssueSpecial } from './availability';
import { PaymentCard } from '../../shared/ui/index';
import { ref } from 'vue';
const props = defineProps<{ view: StateView; me: PlayerId | null; connected: boolean; pending: readonly ClientCommandType[]; now: number; nameOf: (id: string) => string }>();
const emit = defineEmits<{ command: [type: NullPayloadType]; manageAssets: [] }>();
const chargeDialogOpen = ref(true);
const context = computed<ActionContext>(() => ({ view: props.view, me: props.me, connected: props.connected, pending: props.pending, now: props.now }));
const charge = computed(() => props.view.charge);
const paying = computed(() => charge.value != null && props.me === charge.value.payerId);
const shortfall = computed(() => charge.value == null ? 0 : Math.max(0, charge.value.amount - (props.view.balances[charge.value.payerId] ?? 0)));
</script>
<template>
  <section v-if="charge && !paying" class="charge-status" data-testid="charge-status" aria-live="polite">{{ t('charge.other_player', { player: nameOf(charge.payerId) }) }}</section>
  <SpecialCellDialog v-else-if="charge && paying" mobile-mode="sheet" v-model:open="chargeDialogOpen" :title="t('charge.title')"><PaymentCard testid="bank-charge" label="">
    <h2>{{ t('charge.title') }}</h2><p>{{ t('charge.due', { amount: formatMoney(charge.amount) }) }}</p>
    <p v-if="shortfall > 0" class="warn-box" data-testid="charge-shortfall">{{ t('charge.shortfall', { amount: formatMoney(shortfall) }) }}</p>
    <p class="note">{{ t('charge.automatic') }}</p>
    <div class="actions"><Button variant="primary" data-testid="pay-charge" :disabled="!canIssueSpecial(context, 'PayCharge')" @click="emit('command', 'PayCharge')">{{ t('charge.pay', { amount: formatMoney(charge.amount) }) }}</Button><Button data-testid="charge-manage-assets" @click="emit('manageAssets')">{{ t('charge.manage_assets') }}</Button></div>
  </PaymentCard></SpecialCellDialog>
</template>
<style scoped>
.charge-status { padding: var(--space-2) var(--space-3); border: 1px solid var(--border-subtle); border-radius: var(--design-radius-lg); color: var(--text-secondary); }
.charge-panel h2, .charge-panel p { margin: 0; }
.actions { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-2); }
</style>
