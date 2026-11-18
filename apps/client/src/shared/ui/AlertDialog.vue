<script setup lang="ts">
import { AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogOverlay, AlertDialogPortal, AlertDialogRoot, AlertDialogTitle, AlertDialogTrigger } from 'reka-ui';
defineProps<{ title: string; description: string; responsive?: boolean }>();
const open = defineModel<boolean>('open', { default: false });
</script>

<template>
  <AlertDialogRoot v-model:open="open">
    <AlertDialogTrigger v-if="$slots.trigger" as-child><slot name="trigger" /></AlertDialogTrigger>
    <AlertDialogPortal>
      <AlertDialogOverlay class="ds-overlay" />
      <AlertDialogContent class="ds-dialog" :class="{ 'ds-responsive': responsive }">
        <AlertDialogTitle>{{ title }}</AlertDialogTitle>
        <AlertDialogDescription>{{ description }}</AlertDialogDescription>
        <AlertDialogCancel as-child><slot name="cancel" /></AlertDialogCancel>
        <AlertDialogAction as-child><slot name="action" /></AlertDialogAction>
      </AlertDialogContent>
    </AlertDialogPortal>
  </AlertDialogRoot>
</template>
