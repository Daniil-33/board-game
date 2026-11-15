<script setup lang="ts">
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
    <button v-if="!confirming" data-test="Resign" :disabled="!available" @click="confirming = true">Resign</button>
    <div v-else role="group" aria-label="Confirm resignation" class="warn-box">
      <p>Resigning is permanent. You will be out and keep watching the game.</p>
      <button data-test="confirm-resign" :disabled="!available" @click="confirm">Confirm resignation</button>
      <button data-test="cancel-resign" @click="confirming = false">Cancel</button>
    </div>
  </div>
</template>
