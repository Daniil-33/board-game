<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { RoomSummary } from '@game/protocol';
import { useClient } from '../../features/client-session/index';
import { t } from '../../shared/i18n/index';
import { Badge, Button, ResponsiveDialog } from '../../shared/ui/index';

const REFRESH_MS = 5000;
const CAPACITY = 6;
const client = useClient();
const createOpen = ref(false);
const joinOpen = ref(false);
const createCode = ref('');
const joinCode = ref('');
const selectedRoom = ref('');
const dialogError = ref<string | null>(null);
const codeTrigger = ref<HTMLElement | null>(null);
let joinOpener: HTMLElement | null = null;
let timer: ReturnType<typeof setInterval> | undefined;

function canEnterCode(room: RoomSummary): boolean {
  return room.locked && room.status === 'lobby' && room.members.length < CAPACITY;
}

const lockedRooms = computed(() => client.lobby.rooms.filter(canEnterCode));
const eligibleRoom = computed(() => lockedRooms.value.some(room => room.roomId === selectedRoom.value));

function roomStatus(room: RoomSummary): string {
  if (room.status === 'playing') return t('lobby.in_play');
  if (room.status === 'finished') return t('lobby.finished');
  if (room.status === 'closed') return t('lobby.closed');
  if (room.members.length >= CAPACITY) return t('lobby.full');
  return room.locked ? t('lobby.locked') : t('lobby.open');
}

function openJoin(opener: EventTarget | null, roomId = ''): void {
  joinOpener = opener instanceof HTMLElement ? opener : null;
  selectedRoom.value = roomId;
  joinCode.value = '';
  dialogError.value = null;
  joinOpen.value = true;
}

function restoreJoinFocus(event: Event): void {
  event.preventDefault();
  (joinOpener?.isConnected ? joinOpener : codeTrigger.value?.querySelector('button'))?.focus();
}

async function create(): Promise<void> {
  await client.createRoom(createCode.value);
  if (createOpen.value) dialogError.value = client.lobby.error;
}

async function join(): Promise<void> {
  if (!eligibleRoom.value) return;
  await client.joinRoom(selectedRoom.value, joinCode.value);
  if (joinOpen.value) dialogError.value = client.lobby.error;
}

onMounted(() => {
  void client.refreshRooms();
  timer = setInterval(() => {
    if (!client.lobby.busy) void client.refreshRooms({ background: true });
  }, REFRESH_MS);
});
onBeforeUnmount(() => clearInterval(timer));
</script>

<template>
  <section class="lobby">
    <header class="lobby-heading">
      <h2 class="shell-heading">{{ t('lobby.heading') }}</h2>
      <Button class="profile" disabled :reason="t('lobby.profile_reason')">{{ t('lobby.profile') }}</Button>
    </header>
    <aside class="lobby-actions">
      <ResponsiveDialog
        v-model:open="createOpen"
        :title="t('lobby.create_room')"
        @update:open="(open) => { if (open) dialogError = null; }"
      >
        <template #trigger>
          <Button data-testid="open-create" variant="primary" :disabled="client.lobby.busy">{{ t('lobby.create_room') }}</Button>
        </template>
        <form class="shell-form" @submit.prevent="create">
          <label for="create-code">{{ t('lobby.optional_access_code') }}</label>
          <input id="create-code" v-model="createCode" data-testid="create-code" autocomplete="off" />
          <p v-if="dialogError" role="alert" class="error">{{ dialogError }}</p>
          <Button data-testid="create" type="submit" variant="primary" :disabled="client.lobby.busy">{{ t('lobby.create_room') }}</Button>
        </form>
      </ResponsiveDialog>
      <div ref="codeTrigger">
        <Button data-testid="join-by-code" :disabled="client.lobby.busy" @click="openJoin($event.currentTarget)">{{ t('lobby.join_by_code') }}</Button>
      </div>
    </aside>
    <ResponsiveDialog v-model:open="joinOpen" :title="t('lobby.join_by_code')" @close-auto-focus="restoreJoinFocus">
      <form v-if="lockedRooms.length" class="shell-form" data-testid="join-form" @submit.prevent="join">
        <label for="locked-room">{{ t('lobby.choose_room') }}</label>
        <select id="locked-room" v-model="selectedRoom" data-testid="locked-room" required>
          <option value="" disabled>{{ t('lobby.choose_room') }}</option>
          <option v-for="room in lockedRooms" :key="room.roomId" :value="room.roomId">{{ t('common.room', { roomId: room.roomId }) }}</option>
        </select>
        <label for="join-code">{{ t('lobby.access_code') }}</label>
        <input id="join-code" v-model="joinCode" data-testid="join-code" autocomplete="off" required />
        <Button data-testid="submit-join-code" type="submit" variant="primary" :disabled="client.lobby.busy || !eligibleRoom">{{ t('lobby.join') }}</Button>
      </form>
      <p v-else class="muted">{{ t('lobby.no_locked_rooms') }}</p>
      <p v-if="dialogError" role="alert" class="error">{{ dialogError }}</p>
    </ResponsiveDialog>
    <div v-if="client.lobby.inviteRoomId" class="warn-box" data-testid="invite">
      {{ t('lobby.invite_target', { roomId: client.lobby.inviteRoomId }) }}
      <Button :disabled="client.lobby.busy" data-testid="retry-invite" @click="client.retryInvite()">{{ t('lobby.retry_invite') }}</Button>
      <Button :disabled="client.lobby.busy" data-testid="dismiss-invite" @click="client.dismissInvite()">{{ t('lobby.dismiss_invite') }}</Button>
    </div>
    <p v-if="client.lobby.notice" class="warn-box" data-testid="notice">{{ client.lobby.notice }}</p>
    <p v-if="client.lobby.error && !createOpen && !joinOpen" class="error" data-testid="error">{{ client.lobby.error }}</p>
    <section class="shell-card room-list">
      <div class="lobby-heading">
        <h3>{{ t('lobby.rooms') }}</h3>
        <Button data-testid="refresh" :disabled="client.lobby.busy" @click="client.refreshRooms()">{{ t('lobby.refresh') }}</Button>
      </div>
      <p v-if="client.lobby.rooms.length === 0" class="muted" data-testid="empty">{{ t('lobby.empty_rooms') }}</p>
      <ul v-else class="rooms">
        <li v-for="room in client.lobby.rooms" :key="room.roomId" class="room" data-testid="room" :data-room-id="room.roomId">
          <div>
            <strong>{{ t('common.room', { roomId: room.roomId }) }}</strong>
            <div class="muted" data-testid="room-members">{{ room.members.map(member => member.nickname).join(', ') || t('lobby.empty') }}</div>
          </div>
          <div class="room-status">
            <Badge class="ds-number">{{ t('lobby.occupancy', { count: room.members.length, capacity: CAPACITY }) }}</Badge>
            <Badge data-testid="room-status">{{ roomStatus(room) }}</Badge>
            <Badge v-if="room.locked">{{ t('lobby.code_required') }}</Badge>
          </div>
          <Button v-if="canEnterCode(room)" data-testid="join" :disabled="client.lobby.busy" @click="openJoin($event.currentTarget, room.roomId)">{{ t('lobby.join_with_code') }}</Button>
          <Button v-else data-testid="join" :disabled="client.lobby.busy || !room.joinable" @click="client.joinRoom(room.roomId)">{{ t('lobby.join') }}</Button>
        </li>
      </ul>
    </section>
  </section>
</template>

<style scoped>
.lobby { display: grid; gap: var(--space-4); overflow-wrap: anywhere; }
.lobby-heading { display: flex; flex-wrap: wrap; align-items: start; justify-content: space-between; gap: var(--space-3); }
.lobby-heading h3 { margin: 0; align-self: center; }
.lobby-actions { display: grid; align-content: start; gap: var(--space-3); }
.lobby-actions button { width: 100%; min-height: 2.75rem; }
.room { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1.5fr) auto; padding: var(--space-4) 0; }
.room-status { display: flex; flex-wrap: wrap; gap: var(--space-2); margin: var(--space-2) 0; font-size: .85em; }
.lobby-heading :deep(.ds-disabled-reason) { display: block; }
.lobby-heading :deep(.ds-disabled-trigger) { gap: var(--space-1); }
@media (width >= 1024px) {
  .lobby { grid-template-columns: minmax(0, 1fr) 20rem; align-items: start; gap: var(--space-6); }
  .lobby > :is(header, p, .warn-box) { grid-column: 1 / -1; }
  .lobby-actions { grid-column: 2; grid-row: 2; padding: var(--space-5); background: var(--gradient-panel-active); border: 1px solid var(--border-strong); border-radius: var(--design-radius-2xl); }
  .room-list { grid-column: 1; grid-row: 2; }
}
@media (width < 1024px) {
  .room-list { padding: 0; border: 0; background: none; box-shadow: none; }
  .rooms { display: grid; gap: var(--space-2); }
  .room { grid-template-columns: minmax(0, 1fr) auto; gap: var(--space-1) var(--space-2); padding: var(--space-3); border: 1px solid var(--border-subtle); border-radius: var(--design-radius-lg); background: var(--surface-1); }
  .room-status { grid-column: 1; margin: 0; }
  .room button { grid-column: 2; grid-row: 1 / 3; }
}
</style>
