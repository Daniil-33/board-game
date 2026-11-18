<script setup lang="ts">
import { TabsList, TabsRoot, TabsTrigger } from 'reka-ui';
import { computed } from 'vue';
import { t } from '../../shared/i18n/index';

const selected = defineModel<string>({ required: true });
defineProps<{ unread: boolean }>();
const tabs = computed(() => [
  { value: 'board', title: t('game_layout.board'), icon: '▦' },
  { value: 'assets', title: t('game_layout.assets_tab'), icon: '▣' },
  { value: 'journal', title: t('game_layout.journal'), icon: '☰' },
  { value: 'more', title: t('game_layout.more'), icon: '⋯' },
]);
</script>

<template>
  <TabsRoot v-model="selected" class="mobile-nav">
    <TabsList class="mobile-tabs" :aria-label="t('game_layout.navigation')">
      <TabsTrigger v-for="tab in tabs" :key="tab.value" :value="tab.value"
        :data-testid="`game-tab-${tab.value}`" :aria-controls="`game-panel-${tab.value}`">
        <span aria-hidden="true">{{ tab.icon }}</span>
        {{ tab.title }}
        <span v-if="tab.value === 'journal' && unread" class="unread" data-testid="unread-chat"
          role="img" :aria-label="t('game_layout.unread')" />
      </TabsTrigger>
    </TabsList>
  </TabsRoot>
</template>

<style scoped>
.mobile-nav { position: fixed; inset: auto 0 0; z-index: 3; background: var(--bg-deep); border-top: 1px solid var(--border-strong); padding-bottom: env(safe-area-inset-bottom); }
.mobile-tabs { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); }
.mobile-tabs button { position: relative; display: grid; justify-items: center; gap: 3px; min-height: 60px; padding: 6px 2px; border: 0; background: transparent; color: var(--text-secondary); font-size: .78rem; }
.mobile-tabs button[data-state="active"] { color: var(--accent-mint); background: var(--gradient-panel-active); }
.mobile-tabs button > span:first-child { font-size: 1.2rem; }
.unread { position: absolute; width: 8px; height: 8px; top: 9px; left: calc(50% + 12px); border-radius: 50%; background: var(--accent-mint); }
@media (min-width: 1024px) { .mobile-nav { display: none; } }
</style>
