<script setup lang="ts">
import { TooltipContent, TooltipPortal, TooltipRoot, TooltipTrigger } from 'reka-ui';
defineProps<{ text: string }>();
</script>

<template>
  <TooltipRoot>
    <TooltipTrigger as-child><slot /></TooltipTrigger>
    <TooltipPortal>
      <TooltipContent class="ds-float" :side-offset="6">{{ text }}</TooltipContent>
    </TooltipPortal>
  </TooltipRoot>
</template>
