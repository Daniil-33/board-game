<script setup lang="ts">
import { computed } from 'vue';
import DebtNotices from '../components/DebtNotices.vue';
import { useClient } from '../client';
import { eliminationText, formatTime } from '../game/debts';
const client = useClient();
const out = computed(() => {
  const { view, playerId } = client.game;
  return view && playerId && view.eliminated.includes(playerId) ? eliminationText(view, playerId) : null;
});
const result = computed(() => client.game.view?.result ?? null);
/** Final balances in join order; the amounts are the projected ones. */
const balances = computed(() => {
  const r = result.value;
  if (r === null) return [];
  const joined = client.game.view?.players.map(p => p.id as string) ?? [];
  const ids = [...joined.filter(id => Object.hasOwn(r.finalBalances, id)), ...Object.keys(r.finalBalances).filter(id => !joined.includes(id))];
  return ids.map(id => ({ id, amount: r.finalBalances[id]! }));
});
</script>
<template>
  <section class="panel game-over">
    <h2>Game over</h2>
    <p v-if="result" data-test="winner">Winner: {{ client.nameOf(result.winner) }}</p>
    <p v-else data-test="winner">No winner reported.</p>
    <p v-if="out" data-test="spectator">{{ out }}</p>
    <template v-if="result">
      <p data-test="finished-at">Finished at: {{ formatTime(result.finishedAt) }}</p>
      <h3>Elimination order</h3>
      <ol data-test="eliminations"><li v-for="entry in result.eliminations" :key="entry.playerId">{{ client.nameOf(entry.playerId) }}: {{ entry.reason }} at {{ formatTime(entry.at) }}</li></ol>
      <h3>Final balances</h3>
      <ul data-test="final-balances"><li v-for="entry in balances" :key="entry.id">{{ client.nameOf(entry.id) }}: {{ entry.amount }}</li></ul>
    </template>
    <DebtNotices :notices="client.game.notices" :name-of="client.nameOf" :board="client.game.view?.board ?? null" />
    <button class="primary" data-test="return-lobby" @click="client.returnToLobby()">Back to lobby</button>
  </section>
</template>
