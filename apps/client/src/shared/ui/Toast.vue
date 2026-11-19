<script setup lang="ts">
import { ToastClose, ToastDescription, ToastRoot, ToastTitle, VisuallyHidden } from 'reka-ui';
import { computed } from 'vue';
import { t } from '../i18n/index';
defineOptions({ inheritAttrs: false });
const props = defineProps<{ message: string; title?: string; dismissTestId?: string }>();
const open = defineModel<boolean>('open', { required: true });
const announcement = computed(() => props.title ? `${props.title}. ${props.message}` : props.message);
</script>

<template>
  <!-- Reka 2.11 hides its announcement from the accessibility tree. -->
  <VisuallyHidden role="status" aria-live="polite">{{ open ? announcement : '' }}</VisuallyHidden>
  <ToastRoot v-bind="$attrs" v-model:open="open" class="ds-toast">
    <ToastTitle v-if="title" class="ds-toast-title">{{ title }}</ToastTitle>
    <ToastDescription class="ds-toast-description">{{ message }}</ToastDescription>
    <ToastClose :data-testid="dismissTestId" :aria-label="t('common.dismiss')">{{ t('common.dismiss_icon') }}</ToastClose>
  </ToastRoot>
</template>
