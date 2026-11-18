<script setup lang="ts">
import { t } from '../shared/i18n/index';
const reload = (): void => window.location.reload();
</script>

<template>
  <section class="game-chunk-error" role="alert" data-testid="game-chunk-error">
    <p>{{ t('game.load_failed') }}</p>
    <button type="button" @click="reload">{{ t('game.reload') }}</button>
  </section>
</template>
