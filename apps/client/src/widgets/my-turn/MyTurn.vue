<script setup lang="ts">
import { computed } from 'vue';
import { actionAvailability, eliminationText, type ActionContext, type NullPayloadType } from '../../entities/game/index';
import { ActionButtons } from '../../features/turn-actions/index';
import { t } from '../../shared/i18n/index';

const props = defineProps<{ context: ActionContext }>();
const emit = defineEmits<{ command: [type: NullPayloadType] }>();
const available = computed(() => actionAvailability(props.context));
const out = computed(() => {
  const { view, me } = props.context;
  return me !== null && view?.eliminated.includes(me) ? eliminationText(view, me, true) : null;
});
</script>

<template>
  <section class="game-surface" data-testid="my-turn">
    <h2>{{ t('game_layout.my_turn') }}</h2>
    <p v-if="out" class="warn-box" data-testid="spectator">{{ out }}</p>
    <ActionButtons v-if="context.view?.phase !== 'setup'" :available="available" :context="context" @command="emit('command', $event)" />
    <p v-if="context.me && context.view?.rent?.payerId === context.me" class="note" data-testid="auto-pay-note">{{ t('hud.automatic_payment') }}</p>
  </section>
</template>
