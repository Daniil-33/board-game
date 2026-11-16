<script setup lang="ts">
import { computed } from 'vue';
import type { PlayerId, StateView } from '@game/game-core';
import type { ClientCommandType } from '@game/protocol';
import { actionAvailability, activeDeadline, activePlayerId, turnOrder } from '../game/view';
import type { HudMessage } from '../store/game';
import ResignControl from './ResignControl.vue';
import ActionButtons from './ActionButtons.vue';
import TurnOrder from './TurnOrder.vue';
import TurnTimer from './TurnTimer.vue';

const props = defineProps<{
  view: StateView | null;
  me: PlayerId | null;
  connected: boolean;
  /** Types of the commands waiting for their Ack. */
  pending: readonly ClientCommandType[];
  now: number;
  messages: readonly HudMessage[];
  problem: string | null;
  fatal: string | null;
  nameOf: (playerId: string) => string;
  colorOf: (playerId: string) => string;
}>();
const emit = defineEmits<{ command: [type: ClientCommandType]; dismiss: [id: number] }>();

const entries = computed(() => turnOrder(props.view));
const active = computed(() => activePlayerId(props.view));
const available = computed(() =>
  actionAvailability({ view: props.view, me: props.me, connected: props.connected, pending: props.pending, now: props.now }),
);
const headline = computed(() => {
  if (props.view === null || active.value === null) return 'Waiting for the server';
  const name = active.value === props.me ? 'You' : props.nameOf(active.value);
  if (props.view.phase === 'setup') return `Rolling for turn order: ${name}`;
  const verb = active.value === props.me ? 'Your turn' : `Turn: ${name}`;
  return props.view.turn?.bonus ? `${verb} (bonus turn after a double)` : verb;
});
</script>

<template>
  <aside class="hud">
    <p v-if="fatal" class="error" data-test="fatal">{{ fatal }}</p>
    <p v-else-if="!connected" class="warn-box" data-test="offline">Connection lost. Reconnecting…</p>
    <p v-if="problem" class="warn-box" data-test="problem">{{ problem }}</p>

    <h2 data-test="headline">{{ headline }}</h2>
    <TurnTimer :paused="view?.turn?.pausedRemainingMs != null" :deadline="activeDeadline(view)" :now="now" />

    <p v-if="me && view?.eliminated.includes(me)" class="warn-box" data-test="spectator">You are out. Watching the game.</p>
    <ActionButtons :available="available" @command="(type) => emit('command', type)" />

    <ResignControl :available="available.Resign" @confirm="emit('command', 'Resign')" />

    <h3>{{ view?.phase === 'setup' ? 'Order roll' : 'Turn order' }}</h3>
    <TurnOrder :entries="entries" :me="me" :name-of="nameOf" :color-of="colorOf" />

    <ul v-if="messages.length > 0" class="messages">
      <li v-for="message in messages" :key="message.id" class="error" data-test="message">
        <span><strong>{{ message.code }}</strong>: {{ message.message }}</span>
        <button class="link" aria-label="Dismiss" @click="emit('dismiss', message.id)">×</button>
      </li>
    </ul>
  </aside>
</template>
