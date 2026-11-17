<script setup lang="ts">
import { computed, ref } from 'vue';
import { readPixiTheme } from '../shared/config/index';
import { t } from '../shared/i18n/index';
import { AlertDialog, Badge, Button, Countdown, Money, Popover, ResponsiveDialog, Tabs, Toast, Tooltip, UiProvider } from '../shared/ui/index';

const palette = computed(() => Object.entries(readPixiTheme()).filter(([name]) =>
  /^(bg-|surface-|light-|text-|ink-|accent-|gradient-|group-|player-|danger|warning|info$|success$|highlight$|on-accent$)/.test(name)));
const dialog = ref(false);
const alert = ref(false);
const toast = ref(false);
const tab = ref('players');
const tabs = computed(() => [
  { value: 'players', label: t('common.players') },
  { value: 'rent', label: t('common.rent') },
]);
</script>

<template>
  <UiProvider>
    <main class="app design-system-preview" data-testid="design-system-preview">
      <h1 class="font-display">{{ t('app.design_system') }}</h1>
      <section class="ds-preview-controls">
        <ResponsiveDialog v-model:open="dialog" :title="t('asset_card.asset_details')" :description="t('asset_card.other_group_members')">
          <template #trigger><Button variant="primary" data-testid="ds-dialog-trigger">{{ t('asset_card.asset_details') }}</Button></template>
          <Button data-testid="ds-dialog-first" @click="dialog = false">{{ t('asset_card.close') }}</Button>
          <Button data-testid="ds-dialog-last" @click="dialog = false">{{ t('common.dismiss') }}</Button>
        </ResponsiveDialog>
        <AlertDialog v-model:open="alert" :title="t('resign_control.confirm_resignation')" :description="t('resign_control.warning')">
          <template #trigger><Button variant="danger" data-testid="ds-alert-trigger">{{ t('resign_control.resign') }}</Button></template>
          <template #cancel><Button>{{ t('resign_control.cancel') }}</Button></template>
          <template #action><Button variant="danger">{{ t('resign_control.confirm_resignation') }}</Button></template>
        </AlertDialog>
        <Button disabled :reason="t('reasons.house.BUILD_QUOTA_USED')" data-testid="ds-disabled">{{ t('purchase_dialog.buy') }}</Button>
        <Tooltip :text="t('room.invite_link')">
          <Button data-testid="ds-tooltip-trigger">{{ t('room.copy_invite') }}</Button>
        </Tooltip>
        <Popover :label="t('common.rent')">
          <template #trigger><Button data-testid="ds-popover-trigger">{{ t('common.rent') }}</Button></template>
          <Money :value="6150" />
          <Button data-testid="ds-popover-action">{{ t('common.rent') }}</Button>
        </Popover>
        <Button data-testid="ds-toast-trigger" @click="toast = true">{{ t('room.copy_invite') }}</Button>
        <Toast v-model:open="toast" :message="t('room.invite_copied')" />
        <Badge>{{ t('player_panel.active_turn') }} <Countdown :seconds="31" /></Badge>
        <Money :value="6150" />
      </section>
      <Tabs v-model="tab" :label="t('app.design_system')" :tabs="tabs">
        <template #players><Badge>{{ t('common.you') }}</Badge></template>
        <template #rent><Money :value="350" /></template>
      </Tabs>
      <dl class="ds-preview-grid">
        <div v-for="[name, value] in palette" :key="name">
          <dd :style="{ background: value }" />
          <dt>{{ name }}</dt>
        </div>
      </dl>
    </main>
  </UiProvider>
</template>

<style scoped>
.ds-preview-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(106px, 1fr));
  gap: var(--space-2);
}
.ds-preview-grid dd {
  height: var(--space-12);
  margin: 0;
  border: 1px solid var(--border-strong);
  border-radius: var(--design-radius-sm);
}
.ds-preview-grid dt { font-size: .75rem; overflow-wrap: anywhere; }
.ds-preview-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-4);
}
</style>
