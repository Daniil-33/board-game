<script setup lang="ts">
import { t } from '../../shared/i18n/index';
defineProps<{ reconnecting: boolean }>();
</script>

<template>
  <p v-if="reconnecting" class="warn-box" role="status" data-testid="offline">
    <span>{{ t('hud.connection_lost_reconnecting') }}</span>
    <br />
    <span>{{ t('hud.connection_lost_detail') }}</span>
  </p>
</template>
