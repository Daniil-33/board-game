<script setup lang="ts">
import { t } from '../../shared/i18n/index';
defineProps<{ reconnecting: boolean }>();
</script>

<template>
  <p v-if="reconnecting" class="warn-box" role="status" data-testid="offline">
    {{ t('hud.connection_lost_reconnecting') }}
  </p>
</template>
