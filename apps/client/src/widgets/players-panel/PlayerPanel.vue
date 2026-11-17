<script setup lang="ts">
import { formatMoney } from '../../shared/lib/index';

import { t } from '../../shared/i18n/index';
import type { StateView } from '@game/game-core';
import { activePlayerId } from '../../entities/game/index';
defineProps<{ view: StateView; nameOf: (id: string) => string }>();
</script>
<template>
  <section class="player-panel" :aria-label="t('common.players')">
    <h2>{{ t('common.players') }}</h2>
    <ul>
      <li v-for="player in view.players" :key="player.id" data-testid="player-balance" :data-player-id="player.id">
        <strong>{{ nameOf(player.id) }}</strong>
        <span data-testid="player-balance-value">{{ view.balances[player.id] === undefined ? t('common.unreported') : formatMoney(view.balances[player.id]!) }}</span>
        <span v-if="activePlayerId(view) === player.id">{{ t('player_panel.active_turn') }}</span>
        <span v-if="view.eliminated.includes(player.id)">{{ t('player_panel.out') }}</span>
      </li>
    </ul>
  </section>
</template>
