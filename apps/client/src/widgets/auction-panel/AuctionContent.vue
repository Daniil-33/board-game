<script setup lang="ts">
import { Button } from '../../shared/ui/index';
import { formatMoney, formatSeconds } from '../../shared/lib/index';
import { t } from '../../shared/i18n/index';
import { computed, watch } from 'vue';
import { playSound } from '../../shared/sound/index';
import { soundForAuctionTick } from '../../entities/event/index';
import { nextBidAmount, type PlayerId, type StateView } from '@game/game-core';
import type { ClientCommandType } from '@game/protocol';
import { canIssue, remainingSeconds, type NullPayloadType } from '../../entities/game/index';
const props = defineProps<{ view: StateView; me: PlayerId | null; connected: boolean; pending: readonly ClientCommandType[]; now: number; nameOf: (id: string) => string }>();
const emit = defineEmits<{ command: [type: NullPayloadType] }>();
const asset = computed(() => props.view.board?.cells.find(c => c.index === props.view.auction?.cell)?.asset);
const responding = computed(() => props.view.auction?.responder === props.me && props.me !== null && !props.view.eliminated.includes(props.me));
const seconds = computed(() => props.view.auction ? remainingSeconds(props.view.auction.responseDeadline, props.now) : 0);
let lastTick = '';
watch(() => [props.view.auction?.auctionId, props.view.auction?.responseId, seconds.value] as const, ([auctionId, responseId, remaining]) => {
  const key = `${auctionId ?? ''}:${responseId ?? ''}:${remaining}`;
  const sound = soundForAuctionTick(remaining, props.view.auction?.responder ?? null, props.me);
  if (sound && key !== lastTick) {
    lastTick = key;
    playSound(sound.id, { own: sound.own });
  }
});
const leaderColor = computed(() => {
  const leader = props.view.auction?.leader;
  const index = leader === null || leader === undefined ? -1 : props.view.players.findIndex(player => player.id === leader);
  return index < 0 ? undefined : `var(--player-${index + 1})`;
});
</script>

<template>
  <section v-if="view.auction" class="asset-card decision-panel auction-card" :aria-label="t('auction_panel.auction')" data-testid="auction">
    <h2>{{ t('auction_panel.title', { asset: asset?.name }) }}</h2>
    <dl>
      <dt>{{ t('auction_panel.start_bid') }}</dt><dd>{{ formatMoney(view.auction.startBid) }}</dd>
      <dt>{{ t('auction_panel.step') }}</dt><dd>{{ formatMoney(view.auction.step) }}</dd>
      <dt>{{ t('auction_panel.leading_bid') }}</dt><dd data-testid="auction-leading-bid">{{ view.auction.leadingBid === null ? t('auction_panel.none') : formatMoney(view.auction.leadingBid) }}</dd>
      <dt>{{ t('auction_panel.leader') }}</dt><dd data-testid="auction-leader" :style="{ color: leaderColor }">{{ view.auction.leader === null ? t('auction_panel.none') : nameOf(view.auction.leader) }}</dd>
      <dt>{{ t('auction_panel.passed') }}</dt><dd>{{ view.auction.passed.map(nameOf).join(', ') || t('auction_panel.none') }}</dd>
      <dt>{{ t('auction_panel.responder') }}</dt><dd>{{ nameOf(view.auction.responder) }}</dd>
    </dl>
    <p data-testid="auction-timer" :data-last-seconds="seconds <= 3">{{ t('common.seconds_remaining', { seconds: formatSeconds(seconds) }) }}</p>
    <template v-if="responding">
      <Button data-testid="bid" :disabled="!canIssue(props, 'Bid')" @click="emit('command', 'Bid')">{{ t('auction_panel.bid', { amount: formatMoney(nextBidAmount(view.auction)) }) }}</Button>
      <Button data-testid="pass" :disabled="!canIssue(props, 'PassAuction')" @click="emit('command', 'PassAuction')">{{ t('auction_panel.pass') }}</Button>
    </template>
  </section>
</template>

<style scoped>
.auction-card { border-top: 4px solid var(--accent-gold); }
[data-last-seconds="true"] { color: var(--danger-text); font-weight: 700; }
</style>
