<script setup lang="ts">
import { Button, ResponsiveDialog } from '../../shared/ui/index';
import { formatMoney } from '../../shared/lib/index';

import { t } from '../../shared/i18n/index';
import { computed, ref } from 'vue';
import { DebtNotices } from '../../widgets/debt-notices/index';
import { useClient } from '../../features/client-session/index';
import { eliminationText, formatTime } from '../../entities/game/index';
const client = useClient();
const open = ref(true);
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
  <ResponsiveDialog v-model:open="open" :title="t('game_over.game_over')" :dismissible="false" wide>
  <section class="panel game-over" data-testid="game-over-screen">
    <h2 data-testid="game-over-title">{{ t('game_over.game_over') }}</h2>
    <p v-if="result" data-testid="winner">{{ t('game_over.winner', { player: client.nameOf(result.winner) }) }}</p>
    <p v-else data-testid="winner">{{ t('game_over.no_winner_reported') }}</p>
    <p v-if="out" data-testid="spectator">{{ out }}</p>
    <template v-if="result">
      <p data-testid="finished-at">{{ t('game_over.finished_at', { time: formatTime(result.finishedAt) }) }}</p>
      <h3>{{ t('game_over.elimination_order') }}</h3>
      <ol data-testid="eliminations"><li data-testid="elimination-row" :data-player-id="entry.playerId" v-for="entry in result.eliminations" :key="entry.playerId">{{ t('game_over.elimination_entry', { player: client.nameOf(entry.playerId), reason: entry.reason === 'resigned' ? t('game_over.resigned') : t('game_over.bankrupt'), time: formatTime(entry.at) }) }}</li></ol>
      <h3>{{ t('game_over.final_balances') }}</h3>
      <ul data-testid="final-balances"><li data-testid="final-balance-row" :data-player-id="entry.id" v-for="entry in balances" :key="entry.id">{{ t('game_over.balance_entry', { player: client.nameOf(entry.id), amount: formatMoney(entry.amount) }) }}</li></ul>
    </template>
    <DebtNotices :notices="client.game.notices" :name-of="client.nameOf" :board="client.game.view?.board ?? null" />
    <Button variant="primary" data-testid="return-lobby" @click="client.returnToLobby()">{{ t('game_over.back_to_lobby') }}</Button>
  </section>
  </ResponsiveDialog>
</template>

<style scoped>
.game-over { display: grid; gap: var(--space-3); max-height: 70dvh; overflow: auto; }
.game-over > h2 { margin: 0; font-family: var(--design-font-display); }
.game-over ol, .game-over ul { margin: 0; padding-inline-start: var(--space-6); }
</style>
