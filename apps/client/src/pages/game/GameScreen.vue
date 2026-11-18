<script setup lang="ts">
import { t } from '../../shared/i18n/index';
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { boardDisplayKey } from '../../widgets/board/index';
import { TOKEN_COLORS } from '../../widgets/board/index';
import { BOARD_MOUNT_KEY, useClient } from '../../features/client-session/index';
import { PlayerPanel } from '../../widgets/players-panel/index';
import { AssetCard } from '../../widgets/asset-card/index';
import type { Board } from '../../features/client-session/index';
import { PurchaseDialog } from '../../widgets/purchase-card/index';
import { AuctionPanel } from '../../widgets/auction-panel/index';
import { RentPanel } from '../../widgets/rent-panel/index';
import { DebtNotices } from '../../widgets/debt-notices/index';
import { Hud } from '../../widgets/turn-header/index';

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

const pendingTypes = computed(() => client.game.pending.map((c) => c.type));

/** The setup roster uses the same seat palette as the waiting room. */
function colorOf(playerId: string): string {
  const index = Math.max(0, client.game.view?.players.findIndex((p) => p.id === playerId) ?? 0);
  if (client.game.view?.phase === 'setup') return `var(--player-${index + 1})`;
  const color = TOKEN_COLORS[index % TOKEN_COLORS.length]!;
  return `#${color.toString(16).padStart(6, '0')}`;
}

onMounted(async () => {
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
  clearInterval(ticker);
  mountedBoard?.setAssetSelection?.(null);
  client.attachBoard(null);
  destroyBoard?.();
});
</script>

<template>
  <section class="game">
    <div ref="host" class="board" data-testid="board">
      <p v-if="boardError" class="error" data-testid="board-error">{{ boardError }}</p>
    </div>
    <div class="game-panel">
      <DebtNotices :notices="client.game.notices" :name-of="client.nameOf" :board="client.game.view?.board ?? null" />
      <PlayerPanel v-if="client.game.view" :view="client.game.view" :name-of="client.nameOf" />
      <RentPanel v-if="client.game.view?.rent" :view="client.game.view" :me="client.game.playerId" :connected="client.game.connected" :pending="pendingTypes" :now="now" :name-of="client.nameOf" @command="client.sendCommand" />
      <AssetCard
        v-if="selectedCell && client.game.view?.board"
        :owner="selectedOwner" :cell="selectedCell" :board="client.game.view.board"
        :view="client.game.view" :me="client.game.playerId" :connected="client.game.connected" :pending="pendingTypes" :now="now" :name-of="client.nameOf"
        @close="selectedIndex = null" @command="client.sendCommand"
      />
      <PurchaseDialog v-if="client.game.view?.purchase" :view="client.game.view" :me="client.game.playerId" :connected="client.game.connected" :pending="pendingTypes" :now="now" :name-of="client.nameOf" @command="client.sendCommand" />
      <AuctionPanel v-if="client.game.view?.auction" :view="client.game.view" :me="client.game.playerId" :connected="client.game.connected" :pending="pendingTypes" :now="now" :name-of="client.nameOf" @command="client.sendCommand" />
      <Hud
        :view="client.game.view"
        :me="client.game.playerId"
        :connected="client.game.connected"
        :pending="pendingTypes"
        :now="now"
        :history="client.events.state.entries"
        :messages="client.game.messages"
        :problem="client.game.problem"
        :fatal="client.game.fatal"
        :name-of="client.nameOf"
        :color-of="colorOf"
        @command="client.sendCommand"
        @dismiss="client.connection.dismissMessage"
      />
    </div>
  </section>
</template>
