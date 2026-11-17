<script setup lang="ts">
import { formatSeconds } from '../lib/index';
import { t } from '../i18n/index';
defineProps<{ seconds: number }>();
</script>

<template><span class="ds-number">{{ t('common.seconds_remaining', { seconds: formatSeconds(seconds) }) }}</span></template>
