<script setup lang="ts">
import { Badge, Money } from '../../shared/ui/index';

import { t } from '../../shared/i18n/index';
import type { StateView } from '@game/game-core';
import { activePlayerId } from '../../entities/game/index';
import { PlayerAvatar } from '../../shared/ui/index';
const props = defineProps<{ view: StateView; nameOf: (id: string) => string }>();
function housesOf(id: string): number {
  return Object.entries(props.view.houses).reduce((count, [asset, houses]) =>
    count + (props.view.owners[asset] === id ? houses : 0), 0);
}
</script>
<template>
  <section class="player-panel">
    <h2 id="game-panel-players-heading" data-testid="players-heading">{{ t('common.players') }}</h2>
    <ul>
      <li v-for="(player, seat) in view.players" :key="player.id" data-testid="player-balance" :data-player-id="player.id" :style="{ '--seat-color': `var(--player-${seat + 1})` }">
        <PlayerAvatar :name="nameOf(player.id)" />
        <strong data-testid="player-balance-name">{{ nameOf(player.id) }}</strong>
        <Money v-if="view.balances[player.id] !== undefined" data-testid="player-balance-value" :value="view.balances[player.id]!" />
        <span v-else data-testid="player-balance-value">{{ t('common.unreported') }}</span>
        <small data-testid="player-houses">{{ t('game_layout.house_count', { count: housesOf(player.id) }, housesOf(player.id)) }}</small>
        <Badge v-if="view.rent?.payerId === player.id" data-testid="player-debt">{{ t('game_layout.debt') }}</Badge>
        <Badge v-if="activePlayerId(view) === player.id && view.turn?.pausedRemainingMs != null" data-testid="player-paused">{{ t('turn_timer.paused') }}</Badge>
        <Badge v-if="activePlayerId(view) === player.id" data-testid="player-active">{{ t('player_panel.active_turn') }}</Badge>
        <Badge v-if="view.eliminated.includes(player.id)" data-testid="player-eliminated">{{ t('player_panel.out') }}</Badge>
      </li>
    </ul>
  </section>
</template>


<style scoped>
.player-panel li { align-items: center; border-top: 1px solid var(--border-strong); padding: var(--space-3) 0; overflow-wrap: anywhere; }
.player-panel strong { color: var(--seat-color); min-width: 0; }
.player-panel small { flex-basis: 100%; color: var(--text-muted); }
</style>
