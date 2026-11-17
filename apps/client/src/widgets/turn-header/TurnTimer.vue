<script setup lang="ts">
import { formatSeconds } from '../../shared/lib/index';
import { t } from '../../shared/i18n/index';
import { computed } from 'vue';
import { remainingSeconds } from '../../entities/game/index';

/**
 * Time left until the server's deadline. There is no local turn length here:
 * the value is always `deadline - now`.
 */
const props = defineProps<{
  /** Deadline from the view (ms since the epoch), or null when nothing is timed. */
  deadline: number | null;
  /** Current time (ms since the epoch). */
  now: number;
  paused?: boolean;
}>();

const seconds = computed(() => (props.paused || props.deadline === null ? null : remainingSeconds(props.deadline, props.now)));
</script>

<template>
  <div class="timer" :class="{ low: seconds !== null && seconds <= 10 }" data-testid="timer">
    <template v-if="paused">{{ t('turn_timer.paused') }}</template>
    <template v-else-if="seconds !== null">{{ t('common.seconds_remaining', { seconds: formatSeconds(seconds!) }) }}</template>
    <template v-else>{{ t('common.unreported') }}</template>
  </div>
</template>
