<script setup lang="ts">
const props = defineProps<{ testid: string; label?: string }>();
</script>
<template><section class="asset-card decision-panel payment-card" :data-testid="props.testid" :aria-label="props.label"><slot /></section></template>
<style scoped>.payment-card { display: grid; gap: var(--space-3); border-inline-start: 4px solid var(--danger); background: var(--bg-deep); }.payment-card h2 { margin: 0; font-family: var(--design-font-display); }</style>
