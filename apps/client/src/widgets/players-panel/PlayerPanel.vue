<script setup lang="ts">
import { Badge, Money } from '../../shared/ui/index';

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
        <strong data-testid="player-balance-name">{{ nameOf(player.id) }}</strong>
        <Money v-if="view.balances[player.id] !== undefined" data-testid="player-balance-value" :value="view.balances[player.id]!" />
        <span v-else data-testid="player-balance-value">{{ t('common.unreported') }}</span>
        <Badge v-if="activePlayerId(view) === player.id">{{ t('player_panel.active_turn') }}</Badge>
        <Badge v-if="view.eliminated.includes(player.id)">{{ t('player_panel.out') }}</Badge>
      </li>
    </ul>
  </section>
</template>
