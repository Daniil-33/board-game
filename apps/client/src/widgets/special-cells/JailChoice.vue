<script setup lang="ts">
import { computed } from 'vue';
import { jailFee } from '@game/game-core';
import type { PlayerId, StateView } from '@game/game-core';
import type { ClientCommandType } from '@game/protocol';
import { canIssue, connectionReason, type ActionContext, type NullPayloadType } from '../../entities/game/index';
import { Button } from '../../shared/ui/index';
import { formatMoney } from '../../shared/lib/index';
import { t } from '../../shared/i18n/index';
import SpecialCellDialog from './SpecialCellDialog.vue';
import { canIssueSpecial } from './availability';
import { ref } from 'vue';

const props = defineProps<{ view: StateView; me: PlayerId | null; connected: boolean; pending: readonly ClientCommandType[]; now: number }>();
const emit = defineEmits<{ command: [type: NullPayloadType] }>();
const jailDialogOpen = ref(true);
const context = computed<ActionContext>(() => ({ view: props.view, me: props.me, connected: props.connected, pending: props.pending, now: props.now }));
const jailed = computed(() => props.me !== null && Object.hasOwn(props.view.jail, props.me));
const visible = computed(() => jailed.value && props.view.turn?.playerId === props.me && props.view.turn.rolled === false);
const attempts = computed(() => props.me === null ? 0 : props.view.jail[props.me]?.attemptsUsed ?? 0);
const fee = computed(() => jailFee(props.view.economy));
const feeReason = computed(() => (props.me !== null && (props.view.balances[props.me] ?? 0) < fee.value)
  ? t('jail_choice.insufficient_funds', { amount: formatMoney(fee.value) })
  : connectionReason(context.value, 'PayJailFee') ?? '');
const feeEnabled = computed(() => canIssueSpecial(context.value, 'PayJailFee'));
</script>

<template>
  <SpecialCellDialog v-if="visible" mobile-mode="sheet" v-model:open="jailDialogOpen" :title="t('jail_choice.title')"><section class="asset-card decision-panel jail-choice" data-testid="jail-choice" :aria-label="t('jail_choice.title')">
    <div><p class="eyebrow">{{ t('jail_choice.title') }}</p><h2>{{ t('jail_choice.attempt', { attempt: attempts + 1 }) }}</h2></div>
    <div class="attempts" role="img" :aria-label="t('jail_choice.attempt_progress', { attempts: attempts, max: 3 })">
      <span v-for="n in 3" :key="n" :class="{ used: n <= attempts, current: n === attempts + 1 }" :data-testid="`jail-attempt-${n}`"></span>
    </div>
    <p class="hint">{{ t('jail_choice.third_attempt') }}</p>
    <div class="actions">
      <Button variant="primary" data-testid="jail-roll" :disabled="!canIssue(context, 'RollDice')" @click="emit('command', 'RollDice')">{{ t('jail_choice.roll') }}</Button>
      <Button data-testid="jail-pay-fee" :disabled="!feeEnabled" :reason="feeEnabled ? '' : feeReason" @click="emit('command', 'PayJailFee')">{{ t('jail_choice.pay', { amount: formatMoney(fee) }) }}</Button>
    </div>
    <p v-if="!feeEnabled" class="reason" data-testid="jail-fee-reason">{{ feeReason }}</p>
  </section></SpecialCellDialog>
</template>

<style scoped>
.jail-choice { display: grid; gap: var(--space-2); border-inline-start: 4px solid var(--warning); background: var(--bg-deep); }
.jail-choice h2, .jail-choice p { margin: 0; }
.eyebrow { color: var(--text-muted); }
.attempts { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-2); }
.attempts span { height: 8px; border-radius: var(--design-radius-pill); background: var(--surface-1); }
.attempts span.used, .attempts span.current { background: var(--warning); }
.attempts span.current { outline: 2px solid var(--text-primary); outline-offset: 2px; }
.actions { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-2); }
.reason, .hint { color: var(--text-muted); font-size: .875rem; }
</style>
