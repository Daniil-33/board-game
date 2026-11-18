<script setup lang="ts">
import { useId } from 'vue';
import Tooltip from './Tooltip.vue';

withDefaults(defineProps<{ variant?: 'primary' | 'secondary' | 'danger'; disabled?: boolean; reason?: string }>(), { variant: 'secondary' });
defineOptions({ inheritAttrs: false });
const reasonId = useId();
</script>

<template>
  <Tooltip v-if="reason !== undefined" :text="reason">
    <span :class="{ 'ds-disabled-trigger': disabled && reason }" :tabindex="disabled && reason ? 0 : undefined" :role="disabled && reason ? 'group' : undefined" :aria-labelledby="disabled && reason ? reasonId : undefined">
      <button v-bind="$attrs" :class="['ds-button', variant]" :aria-describedby="disabled && reason ? reasonId : undefined" :disabled="disabled"><slot /></button>
      <span v-if="disabled && reason" :id="reasonId" class="ds-disabled-reason">{{ reason }}</span>
    </span>
  </Tooltip>
  <button v-else v-bind="$attrs" :class="['ds-button', variant]" :disabled="disabled"><slot /></button>
</template>
