<script setup lang="ts">
import { t } from '../../shared/i18n/index';
import { ref } from 'vue';
import { NICKNAME_MAX_CODE_POINTS, normalizeNickname } from '@game/protocol';
import { useClient } from '../../features/client-session/index';

const client = useClient();
const nickname = ref('');
const invalid = ref<string | null>(null);

async function submit(): Promise<void> {
  const normalized = normalizeNickname(nickname.value);
  if (normalized === null) {
    // An invalid nickname is never sent.
    invalid.value = t('login.enter_a_nickname', { value0: NICKNAME_MAX_CODE_POINTS });
    return;
  }
  invalid.value = null;
  await client.login(normalized);
}
</script>

<template>
  <section class="panel login">
    <h2>{{ t('login.play_as_a') }}</h2>
    <form @submit.prevent="submit">
      <label for="nickname">{{ t('login.nickname') }}</label>
      <input id="nickname" v-model="nickname" name="nickname" autocomplete="nickname" autofocus />
      <button type="submit" :disabled="client.lobby.busy">{{ t('login.enter') }}</button>
    </form>
    <p v-if="client.lobby.notice" class="warn-box" data-test="notice">{{ client.lobby.notice }}</p>
    <p v-if="invalid" class="error" data-test="invalid">{{ invalid }}</p>
    <p v-else-if="client.lobby.error" class="error" data-test="error">{{ client.lobby.error }}</p>
  </section>
</template>
