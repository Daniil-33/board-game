<script setup lang="ts">
import { soundSettings, setSoundMuted, setSoundVolume } from './index';
import { t } from '../i18n/index';
</script>

<template>
  <div class="sound-controls" role="group" :aria-label="t('sound.controls')">
    <button type="button" class="mute" :aria-pressed="soundSettings.muted" @click="setSoundMuted(!soundSettings.muted)">
      {{ soundSettings.muted ? t('sound.unmute') : t('sound.mute') }}
    </button>
    <label>
      <span>{{ t('sound.volume') }}</span>
      <input type="range" min="0" max="1" step="0.05" :value="soundSettings.volume"
        :aria-label="t('sound.volume')" @input="setSoundVolume(Number(($event.target as HTMLInputElement).value) ?? 0)" />
    </label>
  </div>
</template>

<style scoped>
.sound-controls { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; font-size: .85rem; }
.sound-controls button { border: 1px solid var(--border-strong); background: transparent; color: inherit; border-radius: 8px; padding: .35rem .65rem; cursor: pointer; }
.sound-controls label { display: flex; align-items: center; gap: .4rem; }
.sound-controls input { width: 84px; accent-color: var(--accent-gold); }
.sound-controls :focus-visible { outline: 2px solid var(--accent-gold); outline-offset: 2px; }
</style>
