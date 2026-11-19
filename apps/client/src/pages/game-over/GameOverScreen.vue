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
/** Winner first, followed by eliminated players from latest to earliest. */
const standings = computed(() => {
  const r = result.value;
  if (r === null) return [];
  return [
    { playerId: r.winner, place: 1, reason: null, at: null, amount: r.finalBalances[r.winner] ?? 0 },
    ...[...r.eliminations].reverse().map((entry, index) => ({
      playerId: entry.playerId, place: index + 2, reason: entry.reason, at: entry.at,
      amount: r.finalBalances[entry.playerId] ?? 0,
    })),
  ];
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
      <h3>{{ t('game_over.standings') }}</h3>
      <ol data-testid="eliminations" class="standings-table"><li data-testid="elimination-row" :data-player-id="entry.playerId" v-for="entry in standings" :key="entry.playerId">
        <span class="place">{{ entry.place }}</span><PlayerAvatar :name="client.nameOf(entry.playerId)" :style="{ '--seat-color': `var(--player-${seatOf(entry.playerId)})` }" />
        <span>{{ client.nameOf(entry.playerId) }}<small data-testid="elimination-entry">{{ entry.reason ? t('game_over.elimination_entry', { reason: entry.reason === 'resigned' ? t('game_over.resigned') : t('game_over.bankrupt'), time: formatTime(entry.at!) }) : t('game_over.winner_place') }}</small></span>
        <strong>{{ formatMoney(entry.amount) }}</strong>
      </li></ol>
    </template>
    <details v-if="client.game.notices.length" class="debt-details">
      <summary>{{ t('debt_notices.debt_settlements') }}</summary>
      <DebtNotices :notices="client.game.notices" :name-of="client.nameOf" :board="client.game.view?.board ?? null" />
    </details>
    <Button variant="primary" data-testid="return-lobby" @click="client.returnToLobby()">{{ t('game_over.back_to_lobby') }}</Button>
  </section>
  </ResponsiveDialog>
</template>

<style scoped>
.game-over { display: grid; gap: var(--space-2); max-height: 76dvh; overflow: auto; }
.game-over ol { margin: 0; padding-inline-start: 0; }
.game-over h3, .game-over p { margin-block: var(--space-1); }
.game-over > [data-testid="return-lobby"] { position: sticky; bottom: 0; z-index: 1; }
.debt-details { display: grid; gap: var(--space-2); }
.debt-details summary { cursor: pointer; font-weight: 700; }
.debt-details :deep(.debt-notices) { padding: var(--space-2); }
.winner-hero { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-4); border: 1px solid var(--highlight); border-radius: var(--design-radius-xl); background: var(--bg-deep); }
.winner-hero :deep(.player-avatar) { width: 48px; height: 48px; }
.winner-hero p { margin: 0 0 var(--space-1); }
.winner-hero strong { color: var(--highlight); font-size: 1.4rem; }
.standings-table { display: grid; gap: var(--space-2); list-style: none; padding: 0 !important; }
.standings-table li { display: grid; grid-template-columns: 2rem 32px minmax(0, 1fr) auto; align-items: center; gap: var(--space-2); padding: var(--space-2); border-radius: var(--design-radius-lg); background: var(--bg-deep); }
.standings-table small { display: block; color: var(--text-muted); }
.place { color: var(--highlight); font-weight: 700; }
</style>
