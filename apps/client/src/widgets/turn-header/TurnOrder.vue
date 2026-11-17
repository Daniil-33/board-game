<script setup lang="ts">
import { t } from '../../shared/i18n/index';
import type { OrderEntry } from '../../entities/game/index';

defineProps<{
  entries: readonly OrderEntry[];
  me: string | null;
  nameOf: (playerId: string) => string;
  colorOf: (playerId: string) => string;
}>();
</script>

<template>
  <ol class="order">
    <li
      v-for="entry in entries"
      :key="entry.playerId"
      class="order-entry"
      :class="{ active: entry.active, eliminated: entry.eliminated }"
      :data-active="entry.active"
      data-testid="order-entry"
    >
      <span class="dot" :style="{ background: colorOf(entry.playerId) }" />
      <span class="name" data-testid="order-name">{{ nameOf(entry.playerId) }}</span>
      <span v-if="entry.playerId === me" class="tag">{{ t('common.you') }}</span>
      <span v-if="entry.eliminated" class="tag" data-testid="out">{{ t('turn_order.out') }}</span>
      <span v-if="entry.roll !== null" class="tag" data-testid="order-roll">{{ t('turn_order.rolled', { value0: entry.roll }) }}</span>
      <span v-if="entry.tied" class="tag warn" data-testid="tied">{{ entry.tieRolled ? t('turn_header.tied') : t('turn_header.order_undecided') }}</span>
      <span v-if="entry.jail" class="tag warn" data-testid="jail"> {{ t('turn_order.in_jail_attempts', { value0: entry.jail.attemptsUsed }) }} </span>
    </li>
  </ol>
</template>
