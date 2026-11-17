<script setup lang="ts">
import { PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui';
defineProps<{ label: string }>();
</script>

<template>
  <PopoverRoot>
    <PopoverTrigger as-child><slot name="trigger" /></PopoverTrigger>
    <PopoverPortal>
      <PopoverContent class="ds-float" :aria-label="label" :side-offset="6"><slot /></PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>
