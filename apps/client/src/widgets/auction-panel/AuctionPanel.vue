<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { PlayerId, StateView } from '@game/game-core';
import type { ClientCommandType } from '@game/protocol';
import { ResponsiveDialog } from '../../shared/ui/index';
import { t } from '../../shared/i18n/index';
import type { NullPayloadType } from '../../entities/game/index';
import AuctionContent from './AuctionContent.vue';

const props = defineProps<{ view: StateView; me: PlayerId | null; connected: boolean; pending: readonly ClientCommandType[]; now: number; nameOf: (id: string) => string }>();
const emit = defineEmits<{ command: [type: NullPayloadType] }>();
const mobile = ref(typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches);
const query = typeof window !== 'undefined' ? window.matchMedia('(max-width: 1023px)') : null;
const onViewport = (event: MediaQueryListEvent) => { mobile.value = event.matches; };
onMounted(() => query?.addEventListener('change', onViewport));
onBeforeUnmount(() => query?.removeEventListener('change', onViewport));
const dialogTitle = computed(() => {
  const asset = props.view.board?.cells.find(cell => cell.index === props.view.auction?.cell)?.asset;
  return t('auction_panel.title', { asset: asset?.name ?? '' });
});
</script>

<template>
  <ResponsiveDialog v-if="view.auction && mobile" :open="true" :title="dialogTitle" :dismissible="false" wide>
    <AuctionContent :view="view" :me="me" :connected="connected" :pending="pending" :now="now" :name-of="nameOf" @command="emit('command', $event)" />
  </ResponsiveDialog>
  <AuctionContent v-else-if="view.auction" :view="view" :me="me" :connected="connected" :pending="pending" :now="now" :name-of="nameOf" @command="emit('command', $event)" />
</template>
