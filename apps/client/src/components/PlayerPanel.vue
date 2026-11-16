<script setup lang="ts">
import type { StateView } from '@game/game-core';
import { activePlayerId } from '../game/view';
defineProps<{ view: StateView; nameOf: (id: string) => string }>();
</script>
<template>
  <section class="player-panel" aria-label="Players">
    <h2>Players</h2>
    <ul>
      <li v-for="player in view.players" :key="player.id" data-test="player-balance">
        <strong>{{ nameOf(player.id) }}</strong>
        <span>{{ view.balances[player.id] ?? '–' }}</span>
        <span v-if="activePlayerId(view) === player.id">Active turn</span>
        <span v-if="view.eliminated.includes(player.id)">Out</span>
      </li>
    </ul>
  </section>
</template>
