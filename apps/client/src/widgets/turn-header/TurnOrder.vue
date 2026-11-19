<script setup lang="ts">
import { t } from '../../shared/i18n/index';
import type { OrderEntry } from '../../entities/game/index';

defineProps<{
  setup?: boolean;
  entries: readonly OrderEntry[];
  me: string | null;
  nameOf: (playerId: string) => string;
  colorOf: (playerId: string) => string;
}>();
</script>

<template>
  <ol class="order" :class="{ 'setup-order': setup }">
    <li
      v-for="entry in entries"
      :key="entry.playerId"
      class="order-entry"
      :class="{ active: entry.active, eliminated: entry.eliminated }"
      :data-active="entry.active"
      data-testid="order-entry"
    >
      <span v-if="setup" class="setup-avatar" :style="{ background: colorOf(entry.playerId) }" aria-hidden="true">{{ Array.from(nameOf(entry.playerId))[0] }}</span>
      <span v-else class="dot" :style="{ background: colorOf(entry.playerId) }" />
      <span class="name" data-testid="order-name">{{ nameOf(entry.playerId) }}</span>
      <span v-if="entry.playerId === me" class="tag">{{ t('common.you') }}</span>
      <span v-if="entry.eliminated" class="tag" data-testid="out">{{ t('turn_order.out') }}</span>
      <span v-if="setup" class="setup-die ds-number" :data-testid="entry.roll === null ? undefined : 'order-roll'" :aria-label="entry.roll === null ? t('turn_order.awaiting_roll') : t('turn_order.rolled', { roll: entry.roll })">
        {{ entry.roll ?? t('common.unreported') }}
      </span>
      <span v-else-if="entry.roll !== null" class="tag" data-testid="order-roll">{{ t('turn_order.rolled', { roll: entry.roll }) }}</span>
      <span v-if="entry.tied && (!setup || entry.tieRolled)" class="tag warn" data-testid="tied">{{ entry.tieRolled ? t('turn_order.tied') : t('turn_order.undecided') }}</span>
      <span v-if="entry.jail" class="tag jail-status" data-testid="jail">{{ t('turn_order.jail_attempts', { attempts: entry.jail.attemptsUsed }, entry.jail.attemptsUsed) }}</span>
    </li>
  </ol>
</template>

<style scoped>
.setup-order { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-3); }
.setup-order .order-entry { display: grid; justify-items: center; align-content: start; gap: var(--space-2); padding: var(--space-3); background-color: var(--surface-1); border-radius: var(--design-radius-xl); text-align: center; overflow-wrap: anywhere; }
.setup-order .tag { margin: 0; white-space: normal; }
.setup-order .name { min-width: 0; }
.jail-status { display: inline-flex; align-items: center; border: 1px solid var(--warning); border-radius: var(--design-radius-pill); background: var(--surface-1); color: var(--text-secondary); font-variant-numeric: tabular-nums; }
.setup-avatar, .setup-die { display: grid; place-items: center; aspect-ratio: 1; }
.setup-avatar { width: 3rem; border-radius: 50%; color: var(--on-accent); font-weight: 700; }
.setup-die { width: 3.5rem; border-radius: var(--design-radius-lg); background: var(--gradient-card-light); color: var(--ink-primary); font: 700 1.5rem var(--design-font-display); }
@media (width < 600px) {
  .setup-order { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
