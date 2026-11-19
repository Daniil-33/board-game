<script setup lang="ts">
import { computed } from 'vue';
import { Button } from '../../shared/ui/index';
import { t } from '../../shared/i18n/index';
import { connectionReason, type ActionAvailability, type ActionContext, type NullPayloadType, type TurnCommandType } from '../../entities/game/index';

const props = defineProps<{ available: ActionAvailability; context?: ActionContext }>();
const emit = defineEmits<{ command: [type: NullPayloadType] }>();

const buttons = computed<readonly { type: TurnCommandType; label: string }[]>(() => [
  { type: 'RollDice', label: t('action_buttons.roll_dice') },
  { type: 'EndTurn', label: t('action_buttons.end_turn') },
]);
const primary = computed(() => props.context?.view?.turn?.rolled ? 'EndTurn' : 'RollDice');

function reason(type: TurnCommandType): string | undefined {
  const ctx = props.context;
  if (!ctx || props.available[type]) return undefined;
  return connectionReason(ctx, type) ?? (ctx.view?.turn?.playerId !== ctx.me ? t('game_layout.other_turn') :
    type === 'RollDice' && ctx.view?.turn?.rolled ? t('game_layout.already_rolled') :
      type === 'EndTurn' && !ctx.view?.turn?.rolled ? t('game_layout.roll_required') : t('game_layout.action_unavailable'));
}
</script>

<template>
  <div class="actions">
    <Button
      v-for="button in buttons"
      :key="button.type"
      :variant="button.type === primary ? 'primary' : 'secondary'"
      v-bind="context ? { reason: reason(button.type) ?? '' } : {}"
      :data-testid="button.type"
      :disabled="!available[button.type]"
      @click="emit('command', button.type)"
    >
      {{ button.label }}
    </Button>
  </div>
</template>
