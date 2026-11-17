<script setup lang="ts">
import { formatSeconds } from '../../shared/lib/index';
import { formatMoney } from '../../shared/lib/index';

import { t } from '../../shared/i18n/index';
import { computed } from 'vue';
import { nextBidAmount, type PlayerId, type StateView } from '@game/game-core';
import type { ClientCommandType } from '@game/protocol';
import { canIssue, remainingSeconds, type NullPayloadType } from '../../entities/game/index';
const props = defineProps<{ view: StateView; me: PlayerId | null; connected: boolean; pending: readonly ClientCommandType[]; now: number; nameOf: (id: string) => string }>();
const emit = defineEmits<{ command: [type: NullPayloadType] }>();
const asset = computed(() => props.view.board?.cells.find(c => c.index === props.view.auction?.cell)?.asset);
const responding = computed(() => props.view.auction?.responder === props.me && props.me !== null && !props.view.eliminated.includes(props.me));
</script>
<template>
  <section v-if="view.auction" class="asset-card decision-panel" :aria-label="t('auction_panel.auction')" data-test="auction">
    <h2>{{ t('auction_panel.auction_2', { value0: asset?.name }) }}</h2>
    <dl>
      <dt>{{ t('auction_panel.start_bid') }}</dt><dd>{{ formatMoney(view.auction.startBid) }}</dd>
      <dt>{{ t('auction_panel.step') }}</dt><dd>{{ formatMoney(view.auction.step) }}</dd>
      <dt>{{ t('auction_panel.leading_bid') }}</dt><dd>{{ view.auction.leadingBid === null ? t('auction_panel.none') : formatMoney(view.auction.leadingBid) }}</dd>
      <dt>{{ t('auction_panel.leader') }}</dt><dd>{{ view.auction.leader === null ? t('auction_panel.none') : nameOf(view.auction.leader) }}</dd>
      <dt>{{ t('auction_panel.passed') }}</dt><dd>{{ view.auction.passed.map(nameOf).join(', ') || t('auction_panel.none') }}</dd>
      <dt>{{ t('auction_panel.responder') }}</dt><dd>{{ nameOf(view.auction.responder) }}</dd>
    </dl>
    <p data-test="auction-timer">{{ t('common.s', { value0: formatSeconds(remainingSeconds(view.auction.responseDeadline, now)) }) }}</p>
    <template v-if="responding">
      <button data-test="bid" :disabled="!canIssue(props, 'Bid')" @click="emit('command', 'Bid')">{{ t('auction_panel.bid', { value0: formatMoney(nextBidAmount(view.auction)) }) }}</button>
      <button data-test="pass" :disabled="!canIssue(props, 'PassAuction')" @click="emit('command', 'PassAuction')">{{ t('auction_panel.pass') }}</button>
    </template>
  </section>
</template>
