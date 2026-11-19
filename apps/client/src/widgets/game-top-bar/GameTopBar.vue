<script setup lang="ts">
import { t } from '../../shared/i18n/index';
import { Popover } from '../../shared/ui/index';
import { SoundControls } from '../../shared/sound/index';

defineProps<{ playerCount: number; connected: boolean }>();
</script>

<template>
  <header class="game-top-bar" data-testid="game-top-bar">
    <strong class="product-name">{{ t('game_top_bar.product_name') }}</strong>
    <span class="player-count" data-testid="game-player-count">{{ t('game_top_bar.players', { count: playerCount }, playerCount) }}</span>
    <span class="connection" role="status" :data-connected="connected" data-testid="game-connection">
      <span class="connection-dot" aria-hidden="true"></span>
      {{ connected ? t('game_top_bar.online') : t('game_top_bar.reconnecting') }}
    </span>
    <Popover :label="t('game_top_bar.settings')">
      <template #trigger>
        <button class="settings-button" type="button" :aria-label="t('game_top_bar.settings')" data-testid="game-settings">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6Zm9 4.9v-2.2l-2.2-.6a7.1 7.1 0 0 0-.7-1.6l1.2-1.9-1.6-1.6-1.9 1.2a7.1 7.1 0 0 0-1.6-.7L13.6 3h-2.2l-.6 2.2a7.1 7.1 0 0 0-1.6.7L7.3 4.7 5.7 6.3l1.2 1.9a7.1 7.1 0 0 0-.7 1.6L4 10.4v2.2l2.2.6a7.1 7.1 0 0 0 .7 1.6l-1.2 1.9 1.6 1.6 1.9-1.2a7.1 7.1 0 0 0 1.6.7l.6 2.2h2.2l.6-2.2a7.1 7.1 0 0 0 1.6-.7l1.9 1.2 1.6-1.6-1.2-1.9a7.1 7.1 0 0 0 .7-1.6l2.2-.6Z"/></svg>
        </button>
      </template>
      <SoundControls />
    </Popover>
  </header>
</template>

<style scoped>
.game-top-bar { min-height: 52px; display: flex; align-items: center; gap: var(--space-4); padding: 0 var(--space-3); border: 1px solid var(--border-subtle); border-radius: 12px; background: var(--bg-surface); }
.product-name { color: var(--text-primary); font-size: 1.1rem; }
.player-count { color: var(--text-secondary); }
.connection { display: inline-flex; align-items: center; gap: var(--space-2); margin-left: auto; color: var(--text-secondary); font-size: .9rem; }
.connection-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--success); }
.connection[data-connected="false"] .connection-dot { background: var(--warning); }
.settings-button { display: grid; place-items: center; width: 36px; height: 36px; border: 1px solid var(--border-strong); border-radius: 9px; color: var(--text-primary); background: transparent; cursor: pointer; }
.settings-button svg { width: 19px; height: 19px; fill: currentColor; }
.settings-button:focus-visible { outline: 2px solid var(--accent-gold); outline-offset: 2px; }
@media (max-width: 1023px) { .game-top-bar { gap: var(--space-2); padding-inline: var(--space-2); } .product-name { font-size: .95rem; } .connection { font-size: .8rem; } }
</style>
