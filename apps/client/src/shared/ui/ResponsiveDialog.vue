<script setup lang="ts">
import { DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle, DialogTrigger } from 'reka-ui';
const props = withDefaults(defineProps<{ title: string; description?: string; titleTestId?: string; titleVisuallyHidden?: boolean; wide?: boolean; dismissible?: boolean }>(), { dismissible: true });
const emit = defineEmits<{ closeAutoFocus: [event: Event] }>();
const open = defineModel<boolean>('open', { default: false });
</script>

<template>
  <DialogRoot v-model:open="open">
    <DialogTrigger v-if="$slots.trigger" as-child><slot name="trigger" /></DialogTrigger>
    <DialogPortal>
    <DialogOverlay class="ds-overlay" />
      <DialogContent @escape-key-down="!props.dismissible && $event.preventDefault()" @pointer-down-outside="!props.dismissible && $event.preventDefault()" @close-auto-focus="emit('closeAutoFocus', $event)" class="ds-dialog ds-responsive" :class="{ 'ds-dialog-wide': wide }" aria-modal="true" :aria-describedby="description ? undefined : null">
        <DialogTitle :data-testid="titleTestId" :class="{ 'visually-hidden-title': titleVisuallyHidden }">{{ title }}</DialogTitle>
        <DialogDescription v-if="description">{{ description }}</DialogDescription>
        <slot />
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style scoped>
.visually-hidden-title { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
</style>
