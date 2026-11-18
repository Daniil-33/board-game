<script setup lang="ts">
import { Button } from '../../shared/ui/index';
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
    invalid.value = t('login.invalid_nickname', { maxLength: NICKNAME_MAX_CODE_POINTS });
    return;
  }
  invalid.value = null;
  await client.login(normalized);
}
</script>

<template>
  <section class="panel login shell-card">
    <h2 class="shell-heading">{{ t('login.heading') }}</h2>
    <p id="nickname-guidance" class="muted">{{ t('login.guidance') }}</p>
    <form data-testid="login-form" @submit.prevent="submit">
      <label for="nickname">{{ t('login.nickname') }}</label>
      <input data-testid="nickname" id="nickname" v-model="nickname" name="nickname" autocomplete="nickname" :aria-describedby="invalid ? 'nickname-guidance nickname-error' : 'nickname-guidance'" :aria-invalid="!!invalid" autofocus @input="invalid = null" />
      <Button data-testid="login-enter" type="submit" variant="primary" :disabled="client.lobby.busy">{{ t('login.enter') }}</Button>
    </form>
    <p v-if="client.lobby.notice" class="warn-box" data-testid="notice">{{ client.lobby.notice }}</p>
    <p v-if="invalid" id="nickname-error" role="alert" class="error" data-testid="invalid">{{ invalid }}</p>
    <p v-else-if="client.lobby.error" class="error" data-testid="error">{{ client.lobby.error }}</p>
  </section>
</template>

<style scoped>
.login { width: min(100%, 26rem); margin: clamp(2rem, 13vh, 8rem) auto 0; }
form { display: grid; gap: var(--space-3); }
form button { margin-top: var(--space-1); }
</style>
