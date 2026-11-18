<script setup lang="ts">
import { DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle, DialogTrigger } from 'reka-ui';
defineProps<{ title: string; description?: string; wide?: boolean }>();
const emit = defineEmits<{ closeAutoFocus: [event: Event] }>();
const open = defineModel<boolean>('open', { default: false });
</script>

<template>
  <DialogRoot v-model:open="open">
    <DialogTrigger v-if="$slots.trigger" as-child><slot name="trigger" /></DialogTrigger>
    <DialogPortal>
      <DialogOverlay class="ds-overlay" />
      <DialogContent @close-auto-focus="emit('closeAutoFocus', $event)" class="ds-dialog ds-responsive" :class="{ 'ds-dialog-wide': wide }" :aria-describedby="description ? undefined : null">
        <DialogTitle>{{ title }}</DialogTitle>
        <DialogDescription v-if="description">{{ description }}</DialogDescription>
        <slot />
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
