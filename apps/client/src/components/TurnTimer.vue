<script setup lang="ts">
import { computed } from 'vue';
import { remainingSeconds } from '../game/view';

/**
 * Time left until the server's deadline. There is no local turn length here:
 * the value is always `deadline - now`.
 */
const props = defineProps<{
  /** Deadline from the view (ms since the epoch), or null when nothing is timed. */
  deadline: number | null;
  /** Current time (ms since the epoch). */
  now: number;
}>();

const seconds = computed(() => (props.deadline === null ? null : remainingSeconds(props.deadline, props.now)));
</script>

<template>
  <div class="timer" :class="{ low: seconds !== null && seconds <= 10 }" data-test="timer">
    <template v-if="seconds !== null">{{ seconds }} s</template>
    <template v-else>–</template>
  </div>
</template>
