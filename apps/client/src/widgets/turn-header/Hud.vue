<script setup lang="ts">
import { t } from '../../shared/i18n/index';
import { Button, ResponsiveDialog } from '../../shared/ui/index';
import { computed, ref, watch } from 'vue';
import type { PlayerId, StateView } from '@game/game-core';
import type { ClientCommandType, HistoryEntry } from '@game/protocol';
import { actionAvailability, activeDeadline, activePlayerId, turnOrder, type NullPayloadType } from '../../entities/game/index';
import type { HudMessage } from '../../entities/game/index';
import { ResignControl } from '../../features/resign/index';
import HudStatus from './HudStatus.vue';
import TurnOrder from './TurnOrder.vue';
import TurnTimer from './TurnTimer.vue';
import { SoundControls } from '../../shared/sound/index';

const props = defineProps<{
  view: StateView | null;
  me: PlayerId | null;
  connected: boolean;
  /** Types of the commands waiting for their Ack. */
  pending: readonly ClientCommandType[];
  now: number;
  history?: readonly HistoryEntry[];
  messages: readonly HudMessage[];
  problem: string | null;
  fatal: string | null;
  externalStatus?: boolean;
  nameOf: (playerId: string) => string;
  colorOf: (playerId: string) => string;
}>();
const emit = defineEmits<{ command: [type: NullPayloadType]; dismiss: [id: number] }>();

const setup = computed(() => props.view?.phase === 'setup');
const setupOpen = defineModel<boolean>('setupOpen', { default: false });
const setupTrigger = ref<HTMLElement | null>(null);
const turnHeading = ref<HTMLElement | null>(null);
watch(setup, (isSetup) => {
  setupOpen.value = isSetup;
  if (!isSetup && setupTrigger.value?.contains(document.activeElement)) {
    turnHeading.value?.focus();
  }
}, { immediate: true });

function restoreSetupFocus(event: Event): void {
  event.preventDefault();
  if (setup.value) setupTrigger.value?.querySelector('button')?.focus();
  else turnHeading.value?.focus();
}

const entries = computed(() => {
  const order = turnOrder(props.view);
  const setupView = props.view?.setup;
  if (!setup.value || !setupView) return order;
  const currentGroup = setupView.groups[setupView.round.groupIndex];

  const lastRoll = new Map<string, number>();
  const tied = new Set<string>();
  for (const entry of props.history ?? []) {
    for (const event of entry.events) {
      const payload = event.payload;
      if (payload === null || typeof payload !== 'object') continue;
      if (event.type === 'OrderDieRolled' && 'playerId' in payload && typeof payload.playerId === 'string'
        && 'value' in payload && typeof payload.value === 'number' && Number.isInteger(payload.value)
        && payload.value >= 1 && payload.value <= 6) {
        lastRoll.set(payload.playerId, payload.value);
      }
      if (event.type === 'OrderTied' && 'playerIds' in payload && Array.isArray(payload.playerIds)) {
        for (const id of payload.playerIds) if (typeof id === 'string') tied.add(id);
      }
    }
  }
  return order.map(entry => ({
    ...entry,
    roll: currentGroup?.includes(entry.playerId) ? entry.roll : (lastRoll.get(entry.playerId) ?? null),
    tieRolled: entry.tieRolled || (entry.tied && tied.has(entry.playerId)),
  }));
});
const active = computed(() => activePlayerId(props.view));
const available = computed(() =>
  actionAvailability({ view: props.view, me: props.me, connected: props.connected, pending: props.pending, now: props.now }),
);
const dice = computed(() => {
  const turnId = props.view?.turn?.turnId;
  if (turnId === undefined) return null;
  for (const entry of [...(props.history ?? [])].reverse()) {
    for (const event of [...entry.events].reverse()) {
      const payload = event.payload;
      if (event.type === 'DiceRolled' && payload && typeof payload === 'object' &&
          'turnId' in payload && payload.turnId === turnId && 'dice' in payload &&
          Array.isArray(payload.dice) && payload.dice.length === 2 &&
          payload.dice.every(die => Number.isInteger(die) && die >= 1 && die <= 6)) return payload.dice as number[];
    }
  }
  return null;
});
const headline = computed(() => {
  if (props.view === null || active.value === null) return t('hud.waiting');
  const own = active.value === props.me;
  const player = props.nameOf(active.value);
  if (props.view.phase === 'setup') return own ? t('hud.setup_you') : t('hud.setup_player', { player });
  if (props.view.turn?.bonus) return own ? t('hud.your_bonus_turn') : t('hud.player_bonus_turn', { player });
  return own ? t('hud.your_turn') : t('hud.turn', { player });
});
const phase = computed(() => {
  if (setup.value) return t('game_layout.setup_phase');
  if (props.view?.auction) return t('game_layout.auction_phase');
  if (props.view?.turn?.rolled) return t('game_layout.after_roll');
  return t('game_layout.before_roll');
});
</script>

<template>
  <section class="game-surface turn-header" data-testid="turn-header">
    <SoundControls class="desktop-sound" />
    <HudStatus v-if="!setupOpen && !externalStatus" :fatal="fatal" :connected="connected" :problem="problem" :messages="messages" @dismiss="emit('dismiss', $event)" />

    <div class="turn-meta">
      <div>
        <h2 ref="turnHeading" tabindex="-1" :data-testid="setup && setupOpen ? undefined : 'headline'">{{ headline }}</h2>
        <p class="phase" data-testid="turn-phase">{{ phase }}</p>
      </div>
      <div v-if="dice" class="dice" data-testid="turn-dice">
        <span v-for="(die, index) in dice" :key="index">{{ die }}</span>
      </div>
      <TurnTimer v-if="!setup" :paused="view?.turn?.pausedRemainingMs != null" :deadline="activeDeadline(view)" :now="now" />
    </div>
    <div v-if="setup" ref="setupTrigger">
      <Button data-testid="open-setup" @click="setupOpen = true">{{ t('hud.order_roll') }}</Button>
    </div>
    <ResponsiveDialog
      v-model:open="setupOpen"
      wide
      :title="t('turn_order.setup_title')"
      :description="t('turn_order.setup_description')"
      @close-auto-focus="restoreSetupFocus"
    >
      <div v-if="setup" class="setup-dialog">
        <HudStatus :fatal="fatal" :connected="connected" :problem="problem" :messages="messages" @dismiss="emit('dismiss', $event)" />
        <TurnOrder setup :entries="entries" :me="me" :name-of="nameOf" :color-of="colorOf" />
        <div class="setup-actions">
          <div>
            <strong data-testid="headline">{{ headline }}</strong>
            <TurnTimer :deadline="activeDeadline(view)" :now="now" />
          </div>
          <Button data-testid="RollForOrder" variant="primary" :disabled="!available.RollForOrder" @click="emit('command', 'RollForOrder')">
            {{ t('action_buttons.roll_for_order') }}
          </Button>
        </div>
        <ResignControl :available="available.Resign" @confirm="emit('command', 'Resign')" />
      </div>
    </ResponsiveDialog>

    <details v-if="!setup" class="current-order">
      <summary>{{ t('hud.turn_order') }}</summary>
      <TurnOrder :entries="entries" :me="me" :name-of="nameOf" :color-of="colorOf" />
    </details>
  </section>
</template>

<style scoped>
.turn-meta { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--space-2) var(--space-3); }
.desktop-sound { justify-content: flex-end; margin-bottom: var(--space-2); }
.turn-meta h2 { margin: 0; }
.turn-meta :deep(.timer) { font-family: var(--design-font-display); font-size: 1rem; margin: 0; }
.current-order { font-size: .85rem; color: var(--text-secondary); }
.current-order summary { margin-top: var(--space-2); cursor: pointer; }
.phase { color: var(--text-muted); margin: var(--space-1) 0 0; font-size: .85rem; }
.dice { display: flex; gap: var(--space-2); }
.dice span { background: var(--gradient-card-light); color: var(--ink-primary); border: 1px solid var(--border-strong); border-radius: 6px; padding: 4px 10px; }

.setup-dialog { overflow-wrap: anywhere; }
.setup-actions { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--space-3); margin-top: var(--space-4); }
.setup-actions :deep(.timer) { font-size: 1rem; margin: var(--space-1) 0 0; }
@media (max-width: 1023px) { .desktop-sound { display: none; } }
</style>
