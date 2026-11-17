<script setup lang="ts">
import { t } from '../../shared/i18n/index';
import { ref, watch } from 'vue';
const props = defineProps<{ available: boolean }>();
const emit = defineEmits<{ confirm: [] }>();
const confirming = ref(false);
watch(() => props.available, (value) => { if (!value) confirming.value = false; });
function confirm(): void {
  if (!props.available) return;
  confirming.value = false;
  emit('confirm');
}
</script>
<template>
  <div class="resign">
    <button v-if="!confirming" data-test="Resign" :disabled="!available" @click="confirming = true">{{ t('resign_control.resign') }}</button>
    <div v-else role="group" :aria-label="t('resign_control.confirm_resignation')" class="warn-box">
      <p>{{ t('resign_control.resigning_is_permanent') }}</p>
      <button data-test="confirm-resign" :disabled="!available" @click="confirm">{{ t('resign_control.confirm_resignation') }}</button>
      <button data-test="cancel-resign" @click="confirming = false">{{ t('resign_control.cancel') }}</button>
    </div>
  </div>
</template>
