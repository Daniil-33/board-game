<script setup lang="ts">
import { Button, ResponsiveDialog } from '../../shared/ui/index';
import { formatMoney } from '../../shared/lib/index';

import { t } from '../../shared/i18n/index';
import { computed, ref } from 'vue';
import { DebtNotices } from '../../widgets/debt-notices/index';
import { useClient } from '../../features/client-session/index';
import { eliminationText, formatTime } from '../../entities/game/index';
import { PlayerAvatar } from '../../shared/ui/index';
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
const seatOf = (id: string) => Math.max(0, client.game.view?.players.findIndex(player => player.id === id) ?? 0) + 1;
const winnerBalance = computed(() => result.value?.finalBalances[result.value.winner] ?? null);
</script>
<template>
  <ResponsiveDialog v-model:open="open" :title="t('game_over.game_over')" title-test-id="game-over-title" :dismissible="false" wide>
  <section class="panel game-over" data-testid="game-over-screen">
    <div v-if="result" class="winner-hero">
      <PlayerAvatar :name="client.nameOf(result.winner)" :style="{ '--seat-color': `var(--player-${seatOf(result.winner)})` }" />
      <div><p data-testid="winner">{{ t('game_over.winner', { player: client.nameOf(result.winner) }) }}</p><strong v-if="winnerBalance !== null" data-testid="winner-balance">{{ formatMoney(winnerBalance) }}</strong></div>
    </div>
    <p v-else data-testid="winner">{{ t('game_over.no_winner_reported') }}</p>
    <p v-if="out" data-testid="spectator">{{ out }}</p>
    <template v-if="result">
      <p data-testid="finished-at">{{ t('game_over.finished_at', { time: formatTime(result.finishedAt) }) }}</p>
      <h3>{{ t('game_over.elimination_order') }}</h3>
      <ol data-testid="eliminations" class="standings-table"><li data-testid="elimination-row" :data-player-id="entry.playerId" v-for="(entry, index) in result.eliminations" :key="entry.playerId">
        <span class="place">{{ result.eliminations.length - index + 1 }}</span><PlayerAvatar :name="client.nameOf(entry.playerId)" :style="{ '--seat-color': `var(--player-${seatOf(entry.playerId)})` }" />
        <span>{{ client.nameOf(entry.playerId) }}<small>{{ entry.reason === 'resigned' ? t('game_over.resigned') : t('game_over.bankrupt') }}</small></span>
        <strong>{{ formatMoney(result.finalBalances[entry.playerId] ?? 0) }}</strong>
      </li></ol>
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
.game-over ol, .game-over ul { margin: 0; padding-inline-start: var(--space-6); }
.winner-hero { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-4); border: 1px solid var(--highlight); border-radius: var(--design-radius-xl); background: var(--bg-deep); }
.winner-hero :deep(.player-avatar) { width: 48px; height: 48px; }
.winner-hero p { margin: 0 0 var(--space-1); }
.winner-hero strong { color: var(--highlight); font-size: 1.4rem; }
.standings-table { display: grid; gap: var(--space-2); list-style: none; padding: 0 !important; }
.standings-table li { display: grid; grid-template-columns: 2rem 32px minmax(0, 1fr) auto; align-items: center; gap: var(--space-2); padding: var(--space-2); border-radius: var(--design-radius-lg); background: var(--bg-deep); }
.standings-table small { display: block; color: var(--text-muted); }
.place { color: var(--highlight); font-weight: 700; }
</style>
