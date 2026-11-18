<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { PlayerId, StateView } from '@game/game-core';
import { ResponsiveDialog, Button } from '../../shared/ui/index';
import { eliminationText } from '../../entities/game/index';
import { t } from '../../shared/i18n/index';

const props = defineProps<{ view: StateView; me: PlayerId | null }>();
const open = ref(false);
const eliminated = computed(() => props.me !== null && props.view.phase !== 'finished' && props.view.eliminated.includes(props.me));
const message = computed(() => eliminated.value && props.me ? eliminationText(props.view, props.me) : '');
watch(eliminated, value => { if (value) open.value = true; }, { immediate: true });
</script>

<template>
  <ResponsiveDialog v-if="eliminated" v-model:open="open" :title="t('elimination.title')" :dismissible="true" wide>
    <section class="elimination-screen" data-testid="elimination-screen">
      <p class="warn-box" data-testid="elimination-message">{{ message }}</p>
      <p>{{ t('elimination.watching') }}</p>
      <Button data-testid="continue-watching" variant="primary" @click="open = false">{{ t('elimination.continue') }}</Button>
    </section>
  </ResponsiveDialog>
</template>

<style scoped>
.elimination-screen { display: grid; gap: var(--space-3); }
</style>
