<script setup lang="ts">
import { formatMoney } from '../lib/index';
defineProps<{ value: number }>();
</script>

<template><span class="ds-number">{{ formatMoney(value) }}</span></template>
