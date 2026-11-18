<script setup lang="ts">
import { t } from '../../shared/i18n/index';
import { Button, ResponsiveDialog } from '../../shared/ui/index';
import { computed, ref, watch } from 'vue';
import type { PlayerId, StateView } from '@game/game-core';
import type { ClientCommandType, HistoryEntry } from '@game/protocol';
import { actionAvailability, activeDeadline, activePlayerId, turnOrder, type NullPayloadType } from '../../entities/game/index';
import { eliminationText } from '../../entities/game/index';
import type { HudMessage } from '../../entities/game/index';
import { ResignControl } from '../../features/resign/index';
import { ActionButtons } from '../../features/turn-actions/index';
import HudStatus from './HudStatus.vue';
import TurnOrder from './TurnOrder.vue';
import TurnTimer from './TurnTimer.vue';

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
  nameOf: (playerId: string) => string;
  colorOf: (playerId: string) => string;
}>();
const emit = defineEmits<{ command: [type: NullPayloadType]; dismiss: [id: number] }>();

const setup = computed(() => props.view?.phase === 'setup');
const setupOpen = ref(false);
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
const out = computed(() => (props.me !== null && props.view?.eliminated.includes(props.me) ? eliminationText(props.view, props.me, true) : null));
const headline = computed(() => {
  if (props.view === null || active.value === null) return t('hud.waiting');
  const own = active.value === props.me;
  const player = props.nameOf(active.value);
  if (props.view.phase === 'setup') return own ? t('hud.setup_you') : t('hud.setup_player', { player });
  if (props.view.turn?.bonus) return own ? t('hud.your_bonus_turn') : t('hud.player_bonus_turn', { player });
  return own ? t('hud.your_turn') : t('hud.turn', { player });
});
</script>

<template>
  <aside class="hud">
    <HudStatus v-if="!setupOpen" :fatal="fatal" :connected="connected" :problem="problem" :messages="messages" @dismiss="emit('dismiss', $event)" />

    <h2 ref="turnHeading" tabindex="-1" :data-testid="setup && setupOpen ? undefined : 'headline'">{{ headline }}</h2>
    <TurnTimer v-if="!setup" :paused="view?.turn?.pausedRemainingMs != null" :deadline="activeDeadline(view)" :now="now" />
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

    <p v-if="out" class="warn-box" data-testid="spectator">{{ out }}</p>
    <ActionButtons v-if="!setup" :available="available" @command="(type) => emit('command', type)" />
    <p v-if="me && view?.rent?.payerId === me" class="note" data-testid="auto-pay-note"> {{ t('hud.automatic_payment') }} </p>

    <ResignControl v-if="!setupOpen" :available="available.Resign" @confirm="emit('command', 'Resign')" />

    <template v-if="!setup">
      <h3>{{ t('hud.turn_order') }}</h3>
      <TurnOrder :entries="entries" :me="me" :name-of="nameOf" :color-of="colorOf" />
    </template>

  </aside>
</template>

<style scoped>
.setup-dialog { overflow-wrap: anywhere; }
.setup-actions { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--space-3); margin-top: var(--space-4); }
.setup-actions :deep(.timer) { font-size: 1rem; margin: var(--space-1) 0 0; }
</style>
