<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { PlayerId, StateView } from '@game/game-core';
import { ResponsiveDialog, Button } from '../../shared/ui/index';
import { eliminationText } from '../../entities/game/index';
import { t } from '../../shared/i18n/index';
import { formatMoney } from '../../shared/lib/index';
import { PlayerAvatar } from '../../shared/ui/index';

const props = defineProps<{ view: StateView; me: PlayerId | null; nameOf: (id: string) => string }>();
const open = ref(false);
const eliminated = computed(() => props.me !== null && props.view.phase !== 'finished' && props.view.eliminated.includes(props.me));
const message = computed(() => eliminated.value && props.me ? eliminationText(props.view, props.me) : '');
const playerName = computed(() => props.me ? props.nameOf(props.me) : '');
const seat = computed(() => Math.max(0, props.view.players.findIndex(player => player.id === props.me)) + 1);
watch(eliminated, value => { if (value) open.value = true; }, { immediate: true });
</script>

<template>
  <ResponsiveDialog v-if="eliminated" v-model:open="open" :title="t('elimination.title')" :dismissible="true" wide>
    <section class="elimination-screen" data-testid="elimination-screen">
      <div class="elimination-hero" :style="{ '--seat-color': `var(--player-${seat})` }"><PlayerAvatar :name="playerName" /><div><strong>{{ playerName }}</strong><p class="warn-box" data-testid="elimination-message">{{ message }}</p><small v-if="me && view.balances[me] !== undefined">{{ formatMoney(view.balances[me]!) }}</small></div></div>
      <p>{{ t('elimination.watching') }}</p>
      <Button data-testid="continue-watching" variant="primary" @click="open = false">{{ t('elimination.continue') }}</Button>
    </section>
  </ResponsiveDialog>
</template>

<style scoped>
.elimination-screen { display: grid; gap: var(--space-3); }
.elimination-hero { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-3); border-radius: var(--design-radius-xl); background: var(--bg-deep); }
.elimination-hero :deep(.player-avatar) { width: 48px; height: 48px; }
.elimination-hero p { margin-block: var(--space-1); }
.elimination-hero small { color: var(--text-muted); }
</style>
