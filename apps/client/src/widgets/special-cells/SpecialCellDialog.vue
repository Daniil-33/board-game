<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { ResponsiveDialog } from '../../shared/ui/index';
const props = defineProps<{ title: string; mobileMode?: 'dialog' | 'sheet' }>();
const open = defineModel<boolean>('open', { default: true });
const query = typeof window !== 'undefined' ? window.matchMedia('(max-width: 1023px)') : null;
const mobile = ref(query?.matches ?? false);
const update = (event: MediaQueryListEvent) => { mobile.value = event.matches; };
onMounted(() => query?.addEventListener('change', update));
onBeforeUnmount(() => query?.removeEventListener('change', update));
</script>
<template>
  <ResponsiveDialog v-if="mobile && props.mobileMode !== 'sheet'" v-model:open="open" :title="props.title" title-visually-hidden :dismissible="false" wide><slot /></ResponsiveDialog>
  <slot v-else />
</template>
