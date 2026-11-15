<script setup lang="ts">
import type { OrderEntry } from '../game/view';

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
      :class="{ active: entry.active }"
      :data-active="entry.active"
      data-test="order-entry"
    >
      <span class="dot" :style="{ background: colorOf(entry.playerId) }" />
      <span class="name" data-test="order-name">{{ nameOf(entry.playerId) }}</span>
      <span v-if="entry.playerId === me" class="tag">you</span>
      <span v-if="entry.roll !== null" class="tag" data-test="order-roll">rolled {{ entry.roll }}</span>
      <span v-if="entry.tied" class="tag warn" data-test="tied">{{ entry.tieRolled ? 'tied' : 'order undecided' }}</span>
      <span v-if="entry.jail" class="tag warn" data-test="jail">
        in jail, {{ entry.jail.attemptsUsed }} attempts used (interim rule)
      </span>
    </li>
  </ol>
</template>
