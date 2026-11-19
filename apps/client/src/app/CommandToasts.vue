<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useClient } from '../features/client-session/index';
import { Toast } from '../shared/ui/index';
import { rejectedCommandCopy } from '../entities/game/index';

const client = useClient();
const droppedThrough = ref(0);
const messages = computed(() => client.game.messages.filter(message =>
  message.commandType !== undefined && message.id > droppedThrough.value,
));
watch(messages, current => {
  const dropped = current.at(-4);
  if (dropped) droppedThrough.value = dropped.id;
}, { immediate: true });

const translated = rejectedCommandCopy;

</script>

<template>
  <Toast v-for="message in messages" :key="message.id" :open="true" :title="translated(message).title" :message="translated(message).reason"
    data-testid="message" dismiss-test-id="message-dismiss" :data-code="message.code"
    @update:open="client.connection.dismissMessage(message.id)" />
</template>
