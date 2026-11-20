<script setup lang="ts">
import { Button } from '../../shared/ui/index';
import { t } from '../../shared/i18n/index';
const props = defineProps<{ ceiling: number; label: string }>();
const amount = defineModel<number>({ required: true });
function change(delta: number) { amount.value = Math.max(10, Math.min(props.ceiling, amount.value + delta * 10)); }
function setAmount(raw: string) { const parsed = Number(raw); if (Number.isFinite(parsed)) amount.value = Math.max(10, Math.min(props.ceiling, Math.floor(parsed / 10) * 10)); }
</script>
<template><div class="stepper"><Button data-testid="casino-decrement" :disabled="amount <= 10" @click="change(-1)">{{ t('casino.decrease') }}</Button><label class="sr-only" for="casino-amount">{{ props.label }}</label><input id="casino-amount" data-testid="casino-amount" type="number" min="10" :max="props.ceiling" step="10" :value="amount" @change="setAmount(($event.target as HTMLInputElement).value)"><Button data-testid="casino-increment" :disabled="amount + 10 > props.ceiling" @click="change(1)">{{ t('casino.increase') }}</Button></div></template>
<style scoped>.stepper { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: var(--space-2); align-items: center; }.stepper input { width: 100%; min-width: 0; padding: var(--space-2); border: 1px solid var(--border-strong); border-radius: var(--design-radius-md); background: var(--surface-1); color: var(--text-primary); text-align: center; }.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }</style>
