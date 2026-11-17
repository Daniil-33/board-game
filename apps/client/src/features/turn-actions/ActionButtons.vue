<script setup lang="ts">
import { t } from '../../shared/i18n/index';
import type { ActionAvailability, NullPayloadType, TurnCommandType } from '../../entities/game/index';

defineProps<{ available: ActionAvailability }>();
const emit = defineEmits<{ command: [type: NullPayloadType] }>();

const BUTTONS: readonly { type: TurnCommandType; label: string }[] = [
  { type: 'RollForOrder', label: t('action_buttons.roll_for_order') },
  { type: 'RollDice', label: t('action_buttons.roll_dice') },
  { type: 'EndTurn', label: t('action_buttons.end_turn') },
];
</script>

<template>
  <div class="actions">
    <button
      v-for="button in BUTTONS"
      :key="button.type"
      class="primary"
      :data-test="button.type"
      :disabled="!available[button.type]"
      @click="emit('command', button.type)"
    >
      {{ button.label }}
    </button>
  </div>
</template>
