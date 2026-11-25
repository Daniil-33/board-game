<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { casinoCap } from '@game/game-core';
import type { PlayerId, StateView } from '@game/game-core';
import type { ClientCommandType } from '@game/protocol';
import { canIssue, type ActionContext, type IntentRequest } from '../../entities/game/index';
import { Button } from '../../shared/ui/index';
import { formatMoney } from '../../shared/lib/index';
import { t } from '../../shared/i18n/index';
import SpecialCellDialog from './SpecialCellDialog.vue';
import { canIssueSpecial } from './availability';
import BetStepper from './BetStepper.vue';

const props = defineProps<{ view: StateView; me: PlayerId | null; connected: boolean; pending: readonly ClientCommandType[]; now: number; nameOf: (id: string) => string }>();
const emit = defineEmits<{ command: [intent: IntentRequest] }>();
const context = computed<ActionContext>(() => ({ view: props.view, me: props.me, connected: props.connected, pending: props.pending, now: props.now }));
const offer = computed(() => props.view.casino);
const ownDecision = computed(() => offer.value?.playerId === props.me && props.me !== null);
const ceiling = computed(() => offer.value ? Math.min(casinoCap(props.view.economy), props.view.balances[offer.value.playerId] ?? 0) : 0);
const amount = ref(10);
watch(ceiling, value => { amount.value = value >= 10 ? Math.max(10, Math.min(value, Math.floor(amount.value / 10) * 10)) : 10; });
const maxReason = computed(() => props.view.rent || props.view.charge
  ? t('casino.payment_pending')
  : t('casino.insufficient_funds'));
const betEnabled = computed(() => canIssueSpecial(context.value, 'PlaceCasinoBet') && amount.value >= 10 && amount.value <= ceiling.value && amount.value % 10 === 0);
const betReason = computed(() => betEnabled.value ? '' : maxReason.value);
const surfaceOpen = ref(true);
function choose(type: 'PlaceCasinoBet' | 'DeclineCasino'): void {
  emit('command', type === 'PlaceCasinoBet' ? { type, payload: { amount: amount.value } } : type);
}
</script>

<template>
  <section v-if="offer && !ownDecision" class="casino-status" data-testid="casino-status" aria-live="polite">{{ t('casino.other_player', { player: nameOf(offer.playerId) }) }}</section>
  <SpecialCellDialog v-else-if="offer && ownDecision" v-model:open="surfaceOpen" :title="t('casino.title')">
    <section class="asset-card decision-panel casino-panel" data-testid="casino-panel">
      <h2>{{ t('casino.title') }}</h2><p>{{ t('casino.limit', { amount: formatMoney(ceiling) }) }}</p>
      <BetStepper v-model="amount" :ceiling="ceiling" :label="t('casino.amount')" />
      <p class="preview"><span>{{ t('casino.win', { amount: formatMoney(amount) }) }}</span><span>{{ t('casino.loss', { amount: formatMoney(amount) }) }}</span></p>
      <p v-if="!betEnabled" class="reason" data-testid="casino-bet-reason">{{ betReason }}</p>
      <div class="actions"><Button variant="primary" data-testid="casino-bet" :disabled="!betEnabled" :reason="betReason" @click="choose('PlaceCasinoBet')">{{ t('casino.place_bet') }}</Button><Button data-testid="casino-decline" :disabled="!canIssueSpecial(context, 'DeclineCasino')" @click="choose('DeclineCasino')">{{ t('casino.decline') }}</Button></div>
    </section>
  </SpecialCellDialog>

</template>

<style scoped>
.casino-status { padding: var(--space-2) var(--space-3); border: 1px solid var(--border-subtle); border-radius: var(--design-radius-lg); color: var(--text-secondary); }
.casino-panel { display: grid; gap: var(--space-2); background: var(--bg-deep); }
.casino-panel h2, .casino-panel p { margin: 0; }
.stepper, .preview, .actions { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: var(--space-2); align-items: center; }
.stepper input { width: 100%; min-width: 0; padding: var(--space-2); border: 1px solid var(--border-strong); border-radius: var(--design-radius-md); background: var(--surface-1); color: var(--text-primary); text-align: center; }
.preview { grid-template-columns: 1fr 1fr; color: var(--text-secondary); }
.actions { grid-template-columns: 1fr 1fr; }
.reason { color: var(--text-muted); }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }
</style>
