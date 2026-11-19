<script setup lang="ts">
import { Button } from '../../shared/ui/index';
import { formatMoney, formatSeconds } from '../../shared/lib/index';
import { t } from '../../shared/i18n/index';
import { computed, watch } from 'vue';
import { playSound } from '../../shared/sound/index';
import { createAuctionTickSoundMapper } from '../../entities/event/index';
import { AUCTION_RESPONSE_MS, nextBidAmount, type PlayerId, type StateView } from '@game/game-core';
import type { ClientCommandType } from '@game/protocol';
import { canIssue, remainingSeconds, type NullPayloadType } from '../../entities/game/index';
const props = defineProps<{ view: StateView; me: PlayerId | null; connected: boolean; pending: readonly ClientCommandType[]; now: number; nameOf: (id: string) => string }>();
const emit = defineEmits<{ command: [type: NullPayloadType] }>();
const asset = computed(() => props.view.board?.cells.find(c => c.index === props.view.auction?.cell)?.asset);
const responding = computed(() => props.view.auction?.responder === props.me && props.me !== null && !props.view.eliminated.includes(props.me));
const seconds = computed(() => props.view.auction ? remainingSeconds(props.view.auction.responseDeadline, props.now) : 0);
const elapsedPercent = computed(() => Math.max(0, Math.min(100, (1 - seconds.value * 1000 / AUCTION_RESPONSE_MS) * 100)));
type AuctionResponseState = 'leader' | 'passed' | 'responding' | 'waiting';
const responseState = (id: PlayerId): AuctionResponseState => id === props.view.auction?.leader ? 'leader' : props.view.auction?.passed.includes(id) ? 'passed' : id === props.view.auction?.responder ? 'responding' : 'waiting';
const responseLabel = (id: PlayerId) => {
  switch (responseState(id)) {
    case 'leader': return t('auction_panel.status_leader');
    case 'passed': return t('auction_panel.status_passed');
    case 'responding': return t('auction_panel.status_responding');
    case 'waiting': return t('auction_panel.status_waiting');
  }
};
const mapAuctionTick = createAuctionTickSoundMapper();
watch(() => [props.view.auction?.auctionId, props.view.auction?.responseId, seconds.value] as const, ([auctionId, responseId, remaining]) => {
  const sound = mapAuctionTick(auctionId ?? null, responseId ?? null, remaining, props.view.auction?.responder ?? null, props.me);
  if (sound) {
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
    <header class="auction-header"><p>{{ t('auction_panel.title', { asset: asset?.name }) }}</p><small>{{ t('auction_panel.leading_bid') }}</small><strong data-testid="auction-leading-bid">{{ view.auction.leadingBid === null ? t('auction_panel.none') : formatMoney(view.auction.leadingBid) }}</strong>
      <span class="auction-leader"><span>{{ t('auction_panel.leader') }}</span><strong data-testid="auction-leader" :style="{ color: leaderColor }">{{ view.auction.leader === null ? t('auction_panel.none') : nameOf(view.auction.leader) }}</strong></span>
    </header>
    <div class="auction-terms"><div><small>{{ t('auction_panel.start_bid') }}</small><strong>{{ formatMoney(view.auction.startBid) }}</strong></div><div><small>{{ t('auction_panel.step') }}</small><strong>{{ formatMoney(view.auction.step) }}</strong></div></div>
    <ul class="response-queue" data-testid="auction-queue"><li v-for="id in view.auction.order" :key="id" :data-state="responseState(id)" :data-player-id="id" :style="{ '--seat-color': `var(--player-${Math.max(0, view.players.findIndex(player => player.id === id)) + 1}` }">
      <span class="queue-dot" aria-hidden="true"></span><strong>{{ nameOf(id) }}</strong><span>{{ responseLabel(id) }}</span>
    </li></ul>
    <div class="timer-row"><span data-testid="auction-timer" :data-last-seconds="seconds <= 3">{{ t('common.seconds_remaining', { seconds: formatSeconds(seconds) }) }}</span>
      <div class="auction-progress" role="progressbar" :aria-label="t('auction_panel.response_progress')" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="Math.round(elapsedPercent)"><span :style="{ width: `${elapsedPercent}%` }"></span></div>
    </div>
    <template v-if="responding">
      <Button variant="primary" data-testid="bid" :disabled="!canIssue(props, 'Bid')" @click="emit('command', 'Bid')">{{ t('auction_panel.bid', { amount: formatMoney(nextBidAmount(view.auction)) }) }}</Button>
      <Button data-testid="pass" :disabled="!canIssue(props, 'PassAuction')" @click="emit('command', 'PassAuction')">{{ t('auction_panel.pass') }}</Button>
      <p class="pass-note">{{ t('auction_panel.pass_irrevocable') }}</p>
    </template>
  </section>
</template>

<style scoped>
.auction-card { display: grid; gap: var(--space-3); background: var(--bg-deep); border-top: 4px solid var(--highlight); }
.auction-header { display: grid; justify-items: center; gap: var(--space-1); padding: var(--space-3); border-radius: var(--design-radius-lg); background: var(--surface-1); }
.auction-header p { margin: 0; color: var(--text-muted); }
.auction-header > strong { color: var(--highlight); font-size: clamp(1.7rem, 5vw, 2.5rem); font-variant-numeric: tabular-nums; }
.auction-header small, .auction-leader > span { color: var(--text-muted); }
.auction-leader { display: flex; align-items: baseline; gap: var(--space-1); }
.auction-terms { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: var(--space-2); }
.auction-terms div { display: grid; gap: var(--space-1); padding: var(--space-2); background: var(--surface-1); border-radius: var(--design-radius-md); }
.auction-terms small, .pass-note { color: var(--text-muted); }
.response-queue { list-style: none; display: grid; gap: var(--space-1); padding: 0; margin: 0; }
.response-queue li { display: grid; grid-template-columns: 12px minmax(0,1fr) auto; align-items: center; gap: var(--space-2); padding: var(--space-2); border: 1px solid var(--border-subtle); border-radius: var(--design-radius-md); }
.response-queue li[data-state="responding"] { border-color: var(--highlight); background: var(--surface-1); }
.response-queue li[data-state="leader"] strong { color: var(--seat-color); }
.response-queue li[data-state="passed"] { opacity: .62; }
.response-queue li > span:last-child { color: var(--text-muted); font-size: .85em; text-align: right; }
.queue-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--seat-color); }
.timer-row { display: grid; gap: var(--space-1); }
.auction-progress { height: 8px; overflow: hidden; border-radius: 99px; background: var(--surface-2); }
.auction-progress span { display: block; height: 100%; background: var(--highlight); transition: width .2s linear; }
.pass-note { margin: 0; font-size: .85rem; }
[data-last-seconds="true"] { color: var(--danger-text); font-weight: 700; }
</style>
