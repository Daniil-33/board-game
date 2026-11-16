<script setup lang="ts">
import type { ActionAvailability, NullPayloadType, TurnCommandType } from '../game/view';

defineProps<{ available: ActionAvailability }>();
const emit = defineEmits<{ command: [type: NullPayloadType] }>();

const BUTTONS: readonly { type: TurnCommandType; label: string }[] = [
  { type: 'RollForOrder', label: 'Roll for order' },
  { type: 'RollDice', label: 'Roll dice' },
  { type: 'EndTurn', label: 'End turn' },
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
