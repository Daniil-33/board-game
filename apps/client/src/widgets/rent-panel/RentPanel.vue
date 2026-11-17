<script setup lang="ts">
import { computed } from 'vue';
import type { PlayerId, StateView } from '@game/game-core';
import type { ClientCommandType } from '@game/protocol';
import { canIssue, type NullPayloadType } from '../../entities/game/index';
const props = defineProps<{ view: StateView; me: PlayerId | null; connected: boolean; pending: readonly ClientCommandType[]; now: number; nameOf: (id: string) => string }>();
const emit = defineEmits<{ command: [type: NullPayloadType] }>();
const asset = computed(() => props.view.board?.cells.find(c => c.asset?.assetId === props.view.rent?.assetId)?.asset);
const paying = computed(() => props.me !== null && props.view.rent?.payerId === props.me && !props.view.eliminated.includes(props.me));
</script>
<template>
  <section v-if="view.rent" class="asset-card decision-panel" aria-label="Rent" data-test="rent">
    <h2>Rent due</h2>
    <p data-test="rent-line">
      {{ nameOf(view.rent.payerId) }} owes {{ nameOf(view.rent.ownerId) }} <strong>{{ view.rent.amount }}</strong>
      for {{ asset?.name ?? view.rent.assetId }}<template v-if="view.rent.kind === 'energy'"> (dice sum {{ view.rent.diceSum }})</template>.
    </p>
    <template v-if="paying">
      <button class="primary" data-test="pay-rent" :disabled="!canIssue(props, 'PayRent')" @click="emit('command', 'PayRent')">
        Pay rent: {{ view.rent.amount }} to {{ nameOf(view.rent.ownerId) }}
      </button>
    </template>
  </section>
</template>
