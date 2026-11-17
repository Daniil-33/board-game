<script setup lang="ts">
import { t } from '../../shared/i18n/index';
import { computed } from 'vue';
import type { PlayerId, StateView } from '@game/game-core';
import type { ClientCommandType } from '@game/protocol';
import { actionAvailability, activeDeadline, activePlayerId, turnOrder, type NullPayloadType } from '../../entities/game/index';
import { houseReason } from '../../entities/game/index';
import { mortgageReason } from '../../entities/game/index';
import { eliminationText } from '../../entities/game/index';
import type { HudMessage } from '../../entities/game/index';
import { ResignControl } from '../../features/resign/index';
import { ActionButtons } from '../../features/turn-actions/index';
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
const emit = defineEmits<{ command: [type: NullPayloadType]; dismiss: [id: number] }>();

const entries = computed(() => turnOrder(props.view));
const active = computed(() => activePlayerId(props.view));
const available = computed(() =>
  actionAvailability({ view: props.view, me: props.me, connected: props.connected, pending: props.pending, now: props.now }),
);
const out = computed(() => (props.me !== null && props.view?.eliminated.includes(props.me) ? eliminationText(props.view, props.me) : null));
const reasonFor = (message: HudMessage): string | null => houseReason(message.code, message.commandType) ?? mortgageReason(message.code, message.commandType);
const headline = computed(() => {
  if (props.view === null || active.value === null) return t('hud.waiting_for_the');
  const name = active.value === props.me ? t('turn_header.you') : props.nameOf(active.value);
  if (props.view.phase === 'setup') return t('hud.rolling_for_turn', { value0: name });
  const verb = active.value === props.me ? t('hud.your_turn') : t('hud.turn', { value0: name });
  return props.view.turn?.bonus ? t('hud.bonus_turn_after', { value0: verb }) : verb;
});
</script>

<template>
  <aside class="hud">
    <p v-if="fatal" class="error" data-testid="fatal">{{ fatal }}</p>
    <p v-else-if="!connected" class="warn-box" data-testid="offline">{{ t('hud.connection_lost_reconnecting') }}</p>
    <p v-if="problem" class="warn-box" data-testid="problem">{{ problem }}</p>

    <h2 data-testid="headline">{{ headline }}</h2>
    <TurnTimer :paused="view?.turn?.pausedRemainingMs != null" :deadline="activeDeadline(view)" :now="now" />

    <p v-if="out" class="warn-box" data-testid="spectator">{{ t('hud.watching_the_game', { value0: out }) }}</p>
    <ActionButtons :available="available" @command="(type) => emit('command', type)" />
    <p v-if="me && view?.rent?.payerId === me" class="note" data-testid="auto-pay-note"> {{ t('hud.ending_the_turn') }} </p>

    <ResignControl :available="available.Resign" @confirm="emit('command', 'Resign')" />

    <h3>{{ view?.phase === 'setup' ? t('hud.order_roll') : t('hud.turn_order') }}</h3>
    <TurnOrder :entries="entries" :me="me" :name-of="nameOf" :color-of="colorOf" />

    <ul v-if="messages.length > 0" class="messages">
      <li v-for="message in messages" :key="message.id" class="error" data-testid="message" :data-code="message.code">
        <span><strong>{{ message.code }}</strong>{{ t('common.symbol', { value0: message.message }) }}<template v-if="reasonFor(message)"> {{ t('hud.symbol_2', { value0: reasonFor(message) }) }}</template></span>
        <button data-testid="message-dismiss" class="link" :aria-label="t('common.dismiss')" @click="emit('dismiss', message.id)">{{ t('common.symbol_2') }}</button>
      </li>
    </ul>
  </aside>
</template>
