<script setup lang="ts">
import { t } from '../i18n/index';
import { ToastProvider, ToastViewport, TooltipProvider } from 'reka-ui';
</script>

<template>
  <TooltipProvider>
    <ToastProvider :label="t('app.notification')">
      <slot />
      <ToastViewport class="ds-toast-viewport" :label="(hotkey: string) => t('app.notifications', { hotkey })" />
    </ToastProvider>
  </TooltipProvider>
</template>
