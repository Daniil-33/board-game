<script setup lang="ts">
import { actionAvailability } from '../../entities/game/index';
import { ChatComposer } from '../../features/send-chat/index';
import { ResignControl } from '../../features/resign/index';
import { MobileNav } from '../../widgets/mobile-nav/index';
import { MyTurn } from '../../widgets/my-turn/index';
import { MyAssets } from '../../widgets/my-assets/index';
import { EventFeed } from '../../widgets/event-feed/index';
import { ReconnectBanner } from '../../widgets/reconnect-banner/index';
import { Button } from '../../shared/ui/index';

import { t } from '../../shared/i18n/index';
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { boardDisplayKey } from '../../widgets/board/index';
import { BOARD_MOUNT_KEY, useClient } from '../../features/client-session/index';
import { PlayerPanel } from '../../widgets/players-panel/index';
import { AssetCard } from '../../widgets/asset-card/index';
import type { Board } from '../../features/client-session/index';
import { PurchaseDialog } from '../../widgets/purchase-card/index';
import { AuctionPanel } from '../../widgets/auction-panel/index';
import { RentPanel } from '../../widgets/rent-panel/index';
import { DebtNotices } from '../../widgets/debt-notices/index';
import { Hud, HudStatus } from '../../widgets/turn-header/index';

const TICK_MS = 250;

const client = useClient();
const mountBoard = inject(BOARD_MOUNT_KEY);

const host = ref<HTMLElement | null>(null);
const boardError = ref<string | null>(null);
const now = ref(client.now());

const selectedIndex = ref<number | null>(null);
const selectedCell = computed(() => client.game.view?.board?.cells.find(c => c.index === selectedIndex.value && c.asset !== null) ?? null);
const selectedOwner = computed(() => {
  const asset = selectedCell.value?.asset;
  const owner = asset ? client.game.view?.owners[asset.assetId] : undefined;
  return owner === undefined ? undefined : client.nameOf(owner);
});
watch(() => boardDisplayKey(client.game.view?.board), () => { selectedIndex.value = null; });
let mountedBoard: Board | null = null;
let ticker: ReturnType<typeof setInterval> | undefined;
let destroyBoard: (() => void) | null = null;
let unmounted = false;

// A new view is measured against the clock of its arrival, not the last tick.
watch(
  () => client.game.view,
  () => (now.value = client.now()),
);

const selectedTab = ref('board');
const setupOpen = ref(false);
const media = typeof window.matchMedia === 'function' ? window.matchMedia('(min-width: 1024px)') : null;
const desktop = ref(media?.matches ?? true);
const journalVisible = computed(() => desktop.value || selectedTab.value === 'journal');
const readChat = ref(client.journal.state.liveChat);
const unread = computed(() => readChat.value !== client.journal.state.liveChat);
watch([journalVisible, () => client.journal.state.liveChat], ([visible, count]) => {
  if (visible) readChat.value = count;
});
function updateViewport(event: MediaQueryListEvent): void { desktop.value = event.matches; }
function assetOf(id: string): string {
  return client.game.view?.board?.cells.find(cell => cell.asset?.assetId === id)?.asset?.name ?? id;
}
const pendingTypes = computed(() => client.game.pending.map(command => command.type));
const context = computed(() => ({
  view: client.game.view, me: client.game.playerId, connected: client.game.connected,
  pending: pendingTypes.value, now: now.value,
}));
const connectionMessages = computed(() => client.game.messages.filter(message => !message.commandType));
const canResign = computed(() => actionAvailability(context.value).Resign);
const canLeaveGame = computed(() => {
  const { view, me } = context.value;
  return view !== null && (me === null || view.eliminated.includes(me) || !view.players.some(player => player.id === me));
});
function leaveGame(): void {
  if (canLeaveGame.value) client.returnToLobby();
}

/** Player identities use the same seat palette in the waiting room, setup and on the board. */
function colorOf(playerId: string): string {
  const index = client.game.view?.players.findIndex((p) => p.id === playerId) ?? -1;
  return `var(--player-${Math.max(0, index) + 1})`;
}

onMounted(async () => {
  media?.addEventListener('change', updateViewport);
  ticker = setInterval(() => (now.value = client.now()), TICK_MS);
  if (mountBoard === undefined || host.value === null) return;
  try {
    const mounted = await mountBoard(host.value);
    if (unmounted) return mounted.destroy();
    destroyBoard = mounted.destroy;
    mountedBoard = mounted.board;
    mounted.board.setAssetSelection?.((index) => {
      if (client.game.view?.board?.cells.some(c => c.index === index && c.asset !== null)) selectedIndex.value = index;
    });
    client.attachBoard(mounted.board);
  } catch (error) {
    console.error(error);
    boardError.value = t('game.board_unavailable');
  }
});

onBeforeUnmount(() => {
  unmounted = true;
  media?.removeEventListener('change', updateViewport);
  clearInterval(ticker);
  mountedBoard?.setAssetSelection?.(null);
  client.attachBoard(null);
  destroyBoard?.();
});
</script>

<template>
  <div class="game-screen">
    <ReconnectBanner :reconnecting="!setupOpen && !client.game.connected && !client.game.fatal" />
    <HudStatus v-if="!setupOpen" :messages="connectionMessages" :connected="true"
      :problem="client.game.problem" :fatal="client.game.fatal" @dismiss="client.connection.dismissMessage" />
    <section class="game" :data-tab="selectedTab">
      <div class="roster-column">
        <PlayerPanel v-if="client.game.view" :view="client.game.view" :name-of="client.nameOf" />
      </div>
      <div class="center-column">
        <div class="board-column">
          <Hud v-model:setup-open="setupOpen" :view="client.game.view" :me="client.game.playerId" :connected="client.game.connected"
            :pending="pendingTypes" :now="now" :history="client.events.state.entries"
            :messages="connectionMessages" :problem="client.game.problem"
            :fatal="client.game.fatal" :name-of="client.nameOf" :color-of="colorOf" :external-status="true"
            @command="client.sendCommand" @dismiss="client.connection.dismissMessage" />
          <div class="board-assembly">
            <div ref="host" class="board" id="game-panel-board" :role="desktop ? undefined : 'tabpanel'"
              :aria-label="t('game_layout.board')" data-testid="board">
              <p v-if="boardError" class="error" data-testid="board-error">{{ boardError }}</p>
            </div>
            <div class="journal-column" id="game-panel-journal" :role="desktop ? undefined : 'tabpanel'" :aria-label="t('game_layout.journal')">
              <EventFeed :items="client.journal.state.items" :generation="client.journal.state.generation"
                :visible="journalVisible" :name-of="client.nameOf" :asset-of="assetOf">
                <ChatComposer :chat="client.chat" :transport="client.connection" :connected="client.game.connected" />
              </EventFeed>
            </div>
          </div>
        </div>
        <div class="game-dialogs">
          <DebtNotices :notices="client.game.notices" :name-of="client.nameOf" :board="client.game.view?.board ?? null" />
          <RentPanel v-if="client.game.view?.rent" :view="client.game.view" :me="client.game.playerId" :connected="client.game.connected" :pending="pendingTypes" :now="now" :name-of="client.nameOf" @command="client.sendCommand" />
          <AssetCard
            v-if="selectedCell && client.game.view?.board"
            :owner="selectedOwner" :cell="selectedCell" :board="client.game.view.board"
            :view="client.game.view" :me="client.game.playerId" :connected="client.game.connected" :pending="pendingTypes" :now="now" :name-of="client.nameOf"
            @close="selectedIndex = null" @command="client.sendCommand"
          />
          <PurchaseDialog v-if="client.game.view?.purchase" :view="client.game.view" :me="client.game.playerId" :connected="client.game.connected" :pending="pendingTypes" :now="now" :name-of="client.nameOf" @command="client.sendCommand" />
          <AuctionPanel v-if="client.game.view?.auction" :view="client.game.view" :me="client.game.playerId" :connected="client.game.connected" :pending="pendingTypes" :now="now" :name-of="client.nameOf" @command="client.sendCommand" />
        </div>
      </div>
      <div class="controls-column">
        <div class="turn-column">
          <MyTurn :context="context" @command="client.sendCommand" />
        </div>
        <section class="more-column game-surface" id="game-panel-more" :role="desktop ? undefined : 'tabpanel'" :aria-label="t('game_layout.more')">
          <div class="mobile-only">
            <h2>{{ t('game_layout.more') }}</h2>
            <details data-testid="game-rules">
              <summary>{{ t('game_layout.rules') }}</summary>
              <p>{{ t('game_layout.rules_summary') }}</p>
            </details>
            <div data-testid="game-sound-slot" />
            <Button data-testid="game-leave" :disabled="!canLeaveGame"
              :reason="canLeaveGame ? '' : t('game_layout.leave_requires_resign')" @click="leaveGame">
              {{ t('game_over.back_to_lobby') }}
            </Button>
          </div>
          <ResignControl v-if="!setupOpen" :available="canResign" @confirm="client.sendCommand('Resign')" />
        </section>
        <div class="assets-column" id="game-panel-assets" :role="desktop ? undefined : 'tabpanel'" :aria-label="t('game_layout.assets_tab')">
          <MyAssets :context="context" @command="client.sendCommand" />
        </div>
      </div>
    </section>
    <MobileNav v-model="selectedTab" :unread="unread" />
  </div>
</template>

<style scoped>
.game, .center-column, .board-column, .controls-column { display: grid; gap: var(--space-3); align-content: start; }
.game > *, .board-column, .board { min-width: 0; overflow-wrap: anywhere; }
.board-assembly { width: 100%; margin-inline: auto; }
.board { width: 100%; aspect-ratio: 1; }
.game-dialogs { width: 100%; max-width: 420px; margin-inline: auto; }
.game-dialogs:empty { display: none; }
.more-column :deep(.resign) { margin-top: var(--space-2); }
.more-column details { margin-bottom: var(--space-3); }
@media (max-width: 1023px) {
  .game { padding-bottom: calc(68px + env(safe-area-inset-bottom)); }
  .game:not([data-tab="board"]) :is(.turn-header, .board, .turn-column, .roster-column),
  .game:not([data-tab="journal"]) .journal-column,
  .game:not([data-tab="assets"]) .assets-column,
  .game:not([data-tab="more"]) .more-column { display: none; }
  .roster-column { order: 3; }
  .game[data-tab="journal"] .board-column { display: contents; }
  .journal-column :deep(.event-feed) {
    display: grid;
    grid-template-rows: auto minmax(2rem, 1fr) auto;
    min-height: 12rem;
    height: calc(100dvh - 128px - env(safe-area-inset-bottom));
    overflow: auto;
  }
  .journal-column :deep(.journal-list) { min-height: 0; max-height: none; }
  .game:not([data-tab="board"]):not([data-tab="journal"]) .board-column { display: none; }
}
@media (min-width: 1024px) {
  .game {
    --side-width: 240px;
    grid-template-columns: var(--side-width) minmax(0, 1fr) var(--side-width);
  }
  .board-assembly { position: relative; max-width: 660px; }
  /* Leave the ring and the renderer’s dice and status area unobstructed. */
  .board-column:has(canvas) .journal-column {
    position: absolute;
    inset: 62% 13% 12%;
  }
  .board-column:has(canvas) .journal-column :deep(.event-feed) {
    height: 100%;
    display: grid;
    grid-template-rows: auto minmax(2rem, 1fr) auto;
    overflow: auto;
    background: var(--bg-deep);
    padding: var(--space-2);
  }
  .board-column:has(canvas) .journal-column :deep(h2) { margin-bottom: var(--space-1); }
  .board-column:has(canvas) .journal-column :deep(.journal-list) { min-height: 0; }
  .board-column:has(canvas) .journal-column :deep(.chat-composer) { margin-top: var(--space-2); }
  .mobile-only { display: none; }
  .more-column { padding: 0 var(--space-3) var(--space-3); border-top: 0; border-radius: 0 0 12px 12px; margin-top: calc(-1 * var(--space-3)); }
  .turn-column :deep(.game-surface) { border-bottom: 0; border-radius: 12px 12px 0 0; }
  .more-column :deep(.resign) { margin-top: 0; }
}
@media (min-width: 1280px) { .game { --side-width: 280px; } }
</style>
