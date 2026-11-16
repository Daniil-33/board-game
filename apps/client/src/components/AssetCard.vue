<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount } from 'vue';
import type { BoardCell, GeneratedBoard } from '@game/game-core';
const props = defineProps<{ cell: BoardCell; board: GeneratedBoard; owner?: string | undefined }>();
const emit = defineEmits<{ close: [] }>();
const others = computed(() => props.board.cells.filter(c => c.index !== props.cell.index && c.asset?.groupId === props.cell.asset?.groupId));
function keydown(event: KeyboardEvent): void { if (event.key === 'Escape') emit('close'); }
onMounted(() => window.addEventListener('keydown', keydown));
onBeforeUnmount(() => window.removeEventListener('keydown', keydown));
</script>
<template>
  <section v-if="cell.asset" class="asset-card" aria-label="Asset details" data-test="asset-card">
    <button aria-label="Close asset card" @click="emit('close')">Close</button>
    <h2>{{ cell.asset.name }}</h2>
    <dl>
      <dt>Category</dt><dd>{{ cell.asset.categoryName }}</dd>
      <dt>Group</dt><dd>{{ cell.asset.groupId }}</dd>
      <template v-if="cell.asset.rank !== null"><dt>Rank</dt><dd>{{ cell.asset.rank }}</dd></template>
      <dt>Owner</dt><dd data-test="asset-owner">{{ owner ?? 'free' }}</dd>
      <dt>Price</dt><dd>{{ cell.asset.price }}</dd>
      <dt>Cell</dt><dd>{{ cell.index }}</dd>
    </dl>
    <h3>Other group members</h3>
    <ul><li v-for="other in others" :key="other.index">{{ other.asset!.name }} — {{ other.asset!.price }} (cell {{ other.index }})</li></ul>
  </section>
</template>
