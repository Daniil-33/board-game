<script setup lang="ts">
import { computed } from 'vue';
import { nextBidAmount, type PlayerId, type StateView } from '@game/game-core';
import type { ClientCommandType } from '@game/protocol';
import { canIssue, remainingSeconds, type NullPayloadType } from '../game/view';
const props = defineProps<{ view: StateView; me: PlayerId | null; connected: boolean; pending: readonly ClientCommandType[]; now: number; nameOf: (id: string) => string }>();
const emit = defineEmits<{ command: [type: NullPayloadType] }>();
const asset = computed(() => props.view.board?.cells.find(c => c.index === props.view.auction?.cell)?.asset);
const responding = computed(() => props.view.auction?.responder === props.me && props.me !== null && !props.view.eliminated.includes(props.me));
</script>
<template>
  <section v-if="view.auction" class="asset-card decision-panel" aria-label="Auction" data-test="auction">
    <h2>Auction: {{ asset?.name }}</h2>
    <dl>
      <dt>Start bid</dt><dd>{{ view.auction.startBid }}</dd>
      <dt>Step</dt><dd>{{ view.auction.step }}</dd>
      <dt>Leading bid</dt><dd>{{ view.auction.leadingBid ?? 'None' }}</dd>
      <dt>Leader</dt><dd>{{ view.auction.leader === null ? 'None' : nameOf(view.auction.leader) }}</dd>
      <dt>Passed</dt><dd>{{ view.auction.passed.map(nameOf).join(', ') || 'None' }}</dd>
      <dt>Responder</dt><dd>{{ nameOf(view.auction.responder) }}</dd>
    </dl>
    <p data-test="auction-timer">{{ remainingSeconds(view.auction.responseDeadline, now) }} s</p>
    <template v-if="responding">
      <button data-test="bid" :disabled="!canIssue(props, 'Bid')" @click="emit('command', 'Bid')">Bid {{ nextBidAmount(view.auction) }}</button>
      <button data-test="pass" :disabled="!canIssue(props, 'PassAuction')" @click="emit('command', 'PassAuction')">Pass</button>
    </template>
  </section>
</template>
