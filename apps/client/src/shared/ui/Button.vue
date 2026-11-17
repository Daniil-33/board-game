<script setup lang="ts">
import { useId } from 'vue';
import Tooltip from './Tooltip.vue';

withDefaults(defineProps<{ variant?: 'primary' | 'secondary' | 'danger'; disabled?: boolean; reason?: string }>(), { variant: 'secondary' });
defineOptions({ inheritAttrs: false });
const reasonId = useId();
</script>

<template>
  <Tooltip v-if="disabled && reason" :text="reason">
    <span class="ds-disabled-trigger" tabindex="0" :aria-label="reason">
      <button v-bind="$attrs" :class="['ds-button', variant]" :aria-describedby="reasonId" disabled><slot /></button>
      <span :id="reasonId" class="ds-disabled-reason">{{ reason }}</span>
    </span>
  </Tooltip>
  <button v-else v-bind="$attrs" :class="['ds-button', variant]" :disabled="disabled"><slot /></button>
</template>
