<script setup lang="ts">
import { Button } from '../../shared/ui/index';
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
    <Button v-if="!confirming" data-testid="Resign" :disabled="!available" @click="confirming = true">{{ t('resign_control.resign') }}</Button>
    <div v-else role="group" :aria-label="t('resign_control.confirm_resignation')" class="warn-box">
      <p>{{ t('resign_control.warning') }}</p>
      <Button data-testid="confirm-resign" :disabled="!available" @click="confirm">{{ t('resign_control.confirm_resignation') }}</Button>
      <Button data-testid="cancel-resign" @click="confirming = false">{{ t('resign_control.cancel') }}</Button>
    </div>
  </div>
</template>
