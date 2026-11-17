<script setup lang="ts">
import { formatMoney } from '../../shared/lib/index';

import { t } from '../../shared/i18n/index';
import { computed } from 'vue';
import { DebtNotices } from '../../widgets/debt-notices/index';
import { useClient } from '../../features/client-session/index';
import { eliminationText, formatTime } from '../../entities/game/index';
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
    <h2>{{ t('game_over.game_over') }}</h2>
    <p v-if="result" data-test="winner">{{ t('game_over.winner', { value0: client.nameOf(result.winner) }) }}</p>
    <p v-else data-test="winner">{{ t('game_over.no_winner_reported') }}</p>
    <p v-if="out" data-test="spectator">{{ out }}</p>
    <template v-if="result">
      <p data-test="finished-at">{{ t('game_over.finished_at', { value0: formatTime(result.finishedAt) }) }}</p>
      <h3>{{ t('game_over.elimination_order') }}</h3>
      <ol data-test="eliminations"><li v-for="entry in result.eliminations" :key="entry.playerId">{{ t('game_over.at', { value0: client.nameOf(entry.playerId), value1: entry.reason, value2: formatTime(entry.at) }) }}</li></ol>
      <h3>{{ t('game_over.final_balances') }}</h3>
      <ul data-test="final-balances"><li v-for="entry in balances" :key="entry.id">{{ t('game_over.symbol', { value0: client.nameOf(entry.id), value1: formatMoney(entry.amount) }) }}</li></ul>
    </template>
    <DebtNotices :notices="client.game.notices" :name-of="client.nameOf" :board="client.game.view?.board ?? null" />
    <button class="primary" data-test="return-lobby" @click="client.returnToLobby()">{{ t('game_over.back_to_lobby') }}</button>
  </section>
</template>
