<script setup lang="ts">
import { ToastClose, ToastDescription, ToastRoot, VisuallyHidden } from 'reka-ui';
import { t } from '../i18n/index';
defineOptions({ inheritAttrs: false });
defineProps<{ message: string; dismissTestId?: string }>();
const open = defineModel<boolean>('open', { required: true });
</script>

<template>
  <!-- Reka 2.11 hides its announcement from the accessibility tree. -->
  <VisuallyHidden role="status" aria-live="polite">{{ open ? message : '' }}</VisuallyHidden>
  <ToastRoot v-bind="$attrs" v-model:open="open" class="ds-toast">
    <ToastDescription>{{ message }}</ToastDescription>
    <ToastClose :data-testid="dismissTestId" :aria-label="t('common.dismiss')">{{ t('common.dismiss_icon') }}</ToastClose>
  </ToastRoot>
</template>
