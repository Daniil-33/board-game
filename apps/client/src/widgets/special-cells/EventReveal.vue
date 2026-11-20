<script setup lang="ts">
import { computed } from 'vue';
import type { GameEvent } from '@game/game-core';
import { t } from '../../shared/i18n/index';
import { formatMoney } from '../../shared/lib/index';
const props = defineProps<{ event: GameEvent | null; nameOf: (id: string) => string }>();
function chanceLabel(card: string): string | null {
  switch (card) {
    case 'gain-5': return t('chance.gain-5');
    case 'loss-5': return t('chance.loss-5');
    case 'gain-10': return t('chance.gain-10');
    case 'loss-10': return t('chance.loss-10');
    default: return null;
  }
}
const content = computed(() => {
  const payload = props.event?.payload as Record<string, unknown> | undefined;
  if (!payload || typeof payload.playerId !== 'string') return null;
  const player = props.nameOf(payload.playerId);
  if (props.event?.type === 'ChanceDrawn' && typeof payload.card === 'string' && typeof payload.amount === 'number' && chanceLabel(payload.card) !== null) {
    const gain = payload.card.startsWith('gain-');
    return { kind: 'chance', player, label: chanceLabel(payload.card)!, amount: `${gain ? '+' : '−'}${formatMoney(payload.amount)}` };
  }
  if (props.event?.type === 'CasinoResolved' && typeof payload.amount === 'number' && typeof payload.won === 'boolean') {
    return { kind: 'casino', player, label: payload.won ? t('event_reveal.casino_win') : t('event_reveal.casino_loss'), amount: `${payload.won ? '+' : '−'}${formatMoney(payload.amount)}` };
  }
  return null;
});
</script>
<template>
  <section v-if="content" class="event-reveal" :class="`event-reveal--${content.kind}`" data-testid="special-event-reveal" :data-event-kind="content.kind" aria-live="polite">
      <small>{{ content.player }}</small><strong>{{ content.label }}</strong><b>{{ content.amount }}</b>
  </section>
</template>
<style scoped>
.event-reveal { display: grid; justify-items: center; gap: var(--space-2); width: min(100%, 340px); margin: var(--space-2) auto; padding: var(--space-4); border: 1px solid var(--border-strong); border-radius: var(--design-radius-xl); background: var(--surface-1); box-shadow: var(--shadow-1); text-align: center; backface-visibility: hidden; }
.event-reveal strong { font-family: var(--design-font-display); font-size: 1.15rem; }
.event-reveal b { color: var(--highlight); font-size: 1.35rem; font-variant-numeric: tabular-nums; }
.event-reveal--chance { animation: card-flip 700ms ease both; }
.event-reveal--casino { animation: result-pop 420ms ease both; }
@keyframes card-flip { from { transform: rotateY(90deg) scale(.88); opacity: .4; } to { transform: rotateY(0) scale(1); opacity: 1; } }
@keyframes result-pop { from { transform: scale(.84); opacity: .3; } to { transform: scale(1); opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .event-reveal--chance, .event-reveal--casino { animation: none; } }
</style>
