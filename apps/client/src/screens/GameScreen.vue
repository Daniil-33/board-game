<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { boardDisplayKey } from '../board/display';
import { TOKEN_COLORS } from '../board/BoardCanvas';
import { BOARD_MOUNT_KEY, useClient } from '../client';
import PlayerPanel from '../components/PlayerPanel.vue';
import AssetCard from '../components/AssetCard.vue';
import type { Board } from '../client';
import Hud from '../components/Hud.vue';

const TICK_MS = 250;

const client = useClient();
const mountBoard = inject(BOARD_MOUNT_KEY);

const host = ref<HTMLElement | null>(null);
const boardError = ref<string | null>(null);
const now = ref(client.now());

const selectedIndex = ref<number | null>(null);
const selectedCell = computed(() => client.game.view?.board?.cells.find(c => c.index === selectedIndex.value && c.asset !== null) ?? null);
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

/** Same colour as the player's token: by index in `view.players`. */
function colorOf(playerId: string): string {
  const index = client.game.view?.players.findIndex((p) => p.id === playerId) ?? -1;
  const color = TOKEN_COLORS[(index < 0 ? 0 : index) % TOKEN_COLORS.length]!;
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
    boardError.value = 'The board could not be drawn in this browser. The game continues in the panel.';
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
    <div ref="host" class="board" data-test="board">
      <p v-if="boardError" class="error" data-test="board-error">{{ boardError }}</p>
    </div>
    <div class="game-panel">
      <PlayerPanel v-if="client.game.view" :view="client.game.view" :name-of="client.nameOf" />
      <AssetCard v-if="selectedCell && client.game.view?.board" :cell="selectedCell" :board="client.game.view.board" @close="selectedIndex = null" />
      <Hud
        :view="client.game.view"
        :me="client.game.playerId"
        :connected="client.game.connected"
        :pending="pendingTypes"
        :now="now"
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
