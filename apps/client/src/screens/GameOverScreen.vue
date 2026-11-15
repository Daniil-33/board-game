<script setup lang="ts">
import { useClient } from '../client';
const client = useClient();
</script>
<template>
  <section class="panel game-over">
    <h2>Game over</h2>
    <p v-if="client.game.view?.winner" data-test="winner">Winner: {{ client.nameOf(client.game.view.winner) }}</p>
    <p v-else data-test="winner">No winner reported.</p>
    <p v-if="client.game.playerId && client.game.view?.eliminated.includes(client.game.playerId)" data-test="spectator">You are out.</p>
    <button class="primary" data-test="return-lobby" @click="client.returnToLobby()">Back to lobby</button>
  </section>
</template>
