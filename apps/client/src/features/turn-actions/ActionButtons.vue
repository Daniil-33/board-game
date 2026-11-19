<script setup lang="ts">
import { computed } from 'vue';
import { Button } from '../../shared/ui/index';
import { t } from '../../shared/i18n/index';
import { connectionReason, type ActionAvailability, type ActionContext, type NullPayloadType, type TurnCommandType } from '../../entities/game/index';

const props = defineProps<{ available: ActionAvailability; context?: ActionContext; nameOf?: ((id: string) => string) | undefined }>();
const emit = defineEmits<{ command: [type: NullPayloadType] }>();

const buttons = computed<readonly { type: TurnCommandType; label: string }[]>(() => [
  { type: 'RollDice', label: t('action_buttons.roll_dice') },
  { type: 'EndTurn', label: t('action_buttons.end_turn') },
]);
const primary = computed(() => props.context?.view?.turn?.rolled ? 'EndTurn' : 'RollDice');
const notActive = computed(() => {
  const turn = props.context?.view?.turn;
  return turn !== null && turn !== undefined && turn.playerId !== props.context?.me;
});

function reason(type: TurnCommandType): string | undefined {
  const ctx = props.context;
  if (!ctx || props.available[type]) return undefined;
  const activePlayer = ctx.view?.turn?.playerId;
  const otherPlayer = activePlayer ? props.nameOf?.(activePlayer) ?? activePlayer : '';
  return connectionReason(ctx, type) ?? (activePlayer !== ctx.me ? t('game_layout.other_turn', { player: otherPlayer }) :
    type === 'RollDice' && ctx.view?.turn?.rolled ? t('game_layout.already_rolled') :
      type === 'EndTurn' && !ctx.view?.turn?.rolled ? t('game_layout.roll_required') : t('game_layout.action_unavailable'));
}

const visibleReasons = computed(() => {
  if (!props.context) return [];
  if (notActive.value) {
    const id = props.context.view?.turn?.playerId;
    return [{ label: '', message: t('game_layout.other_turn', { player: id ? props.nameOf?.(id) ?? id : '' }) }];
  }
  return buttons.value.filter(button => !props.available[button.type])
    .map(button => ({ label: button.label, message: reason(button.type) }))
    .filter((value): value is { label: string; message: string } => Boolean(value.message));
});
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
  <div v-if="visibleReasons.length" class="visible-action-reasons" aria-live="polite">
    <p v-for="(reason, index) in visibleReasons" :key="`${index}-${reason.message}`" data-testid="turn-action-reason">
      {{ reason.label ? t('game_layout.action_reason', { action: reason.label, reason: reason.message }) : reason.message }}
    </p>
  </div>
</template>

<style scoped>
.visible-action-reasons { display: grid; gap: var(--space-1); color: var(--text-muted); font-size: .85rem; }
.visible-action-reasons p { margin: 0; }
.actions :deep(.ds-disabled-reason) { display: none; }
</style>
