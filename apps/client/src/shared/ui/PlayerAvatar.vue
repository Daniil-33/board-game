<script setup lang="ts">
defineProps<{ name: string }>();
</script>

<template><span class="player-avatar" aria-hidden="true">{{ Array.from(name)[0]?.toUpperCase() }}</span></template>

<style scoped>
.player-avatar { display: inline-grid; place-items: center; width: 32px; height: 32px; flex: none; border-radius: 50%; background: var(--seat-color); color: var(--on-accent); font-weight: 700; }
</style>
