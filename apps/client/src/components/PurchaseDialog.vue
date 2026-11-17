<script setup lang="ts">
import { computed } from 'vue';
import type { PlayerId, StateView } from '@game/game-core';
import type { ClientCommandType } from '@game/protocol';
import { canIssue, type NullPayloadType } from '../game/view';
const props = defineProps<{ view: StateView; me: PlayerId | null; connected: boolean; pending: readonly ClientCommandType[]; now: number; nameOf: (id: string) => string }>();
const emit = defineEmits<{ command: [type: NullPayloadType] }>();
const asset = computed(() => props.view.board?.cells.find(c => c.index === props.view.purchase?.cell)?.asset);
const deciding = computed(() => props.view.purchase?.playerId === props.me && props.me !== null && !props.view.eliminated.includes(props.me));
</script>
<template>
  <section v-if="view.purchase" class="asset-card decision-panel" :role="deciding ? 'dialog' : 'status'" aria-label="Purchase decision" data-test="purchase">
    <h2>{{ asset?.name }}</h2>
    <p>Price: {{ asset?.price }}</p>
    <template v-if="deciding">
      <p>Your balance: {{ view.balances[me!] }}</p>
      <button data-test="buy" :disabled="!canIssue(props, 'BuyAsset')" @click="emit('command', 'BuyAsset')">Buy</button>
      <button data-test="start-auction" :disabled="!canIssue(props, 'StartAuction')" @click="emit('command', 'StartAuction')">Start auction</button>
    </template>
    <p v-else>{{ nameOf(view.purchase.playerId) }} is deciding.</p>
  </section>
</template>
