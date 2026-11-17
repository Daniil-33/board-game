<script setup lang="ts">
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
  <div class="timer" :class="{ low: seconds !== null && seconds <= 10 }" data-test="timer">
    <template v-if="paused">paused</template>
    <template v-else-if="seconds !== null">{{ seconds }} s</template>
    <template v-else>–</template>
  </div>
</template>
