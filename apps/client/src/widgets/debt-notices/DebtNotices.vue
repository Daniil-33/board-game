<script setup lang="ts">
import { computed } from 'vue';
import { Button } from '../../shared/ui/index';
import { formatMoney } from '../../shared/lib/index';

import { t } from '../../shared/i18n/index';
import type { GeneratedBoard } from '@game/game-core';
import { assetName, liquidationStepText, type DebtNotice } from '../../entities/game/index';
const props = withDefaults(defineProps<{
  notices: readonly DebtNotice[];
  activeNoticeIndex?: number | null;
  variant?: 'overlay' | 'history';
  nameOf: (id: string) => string;
  board?: GeneratedBoard | null;
}>(), { variant: 'history' });
const emit = defineEmits<{ dismiss: [] }>();
const displayedNotices = computed(() => {
  if (props.variant === 'history') return props.notices;
  const index = props.activeNoticeIndex;
  return index === null || index === undefined || props.notices[index] === undefined ? [] : [props.notices[index]!];
});
</script>
<template>
  <section v-if="displayedNotices.length" :class="['debt-notices', `debt-notices--${variant}`]"
    :aria-label="t('debt_notices.debt_notices')"
    :data-testid="variant === 'overlay' ? 'current-debt-notice' : 'debt-notices'">
    <h3>{{ t('debt_notices.debt_settlements') }}</h3>
    <article v-for="(notice, index) in displayedNotices" :key="index" :data-testid="notice.kind">
      <template v-if="notice.kind === 'liquidation'">
        <h4 data-testid="debt-notice-title">{{ t('debt_notices.liquidation', { player: nameOf(notice.payerId) }) }}</h4>
        <p data-testid="liquidation-debt">{{ t('debt_notices.debt', { creditor: nameOf(notice.creditorId), debt: formatMoney(notice.debt) }) }}</p>
        <ol>
          <li v-for="(step, i) in notice.steps" :key="i" data-testid="liquidation-step"> {{ liquidationStepText(step, board) }}
          </li>
        </ol>
        <p data-testid="liquidation-total">{{ notice.payment === null ? t('debt_notices.payment_unreported', { raised: formatMoney(notice.raised) }) : t('debt_notices.payment_summary', { raised: formatMoney(notice.raised), payment: formatMoney(notice.payment) }) }}</p>
      </template>
      <template v-else>
        <h4 data-testid="debt-notice-title">{{ t('debt_notices.bankruptcy', { player: nameOf(notice.playerId) }) }}</h4>
        <p data-testid="bankruptcy-amounts">{{ t('debt_notices.bankruptcy_summary', { creditor: nameOf(notice.creditorId), debt: formatMoney(notice.debt), paid: formatMoney(notice.paid), writtenOff: formatMoney(notice.writtenOff) }) }}</p>
        <p data-testid="bankruptcy-assets">{{ notice.assetIds.length ? t('debt_notices.freed_assets', { assets: notice.assetIds.map(id => assetName(board, id)).join(', ') }) : t('debt_notices.freed_assets_empty') }}</p>
      </template>
    </article>
    <Button v-if="variant === 'overlay'" data-testid="debt-notice-dismiss" @click="emit('dismiss')">
      {{ t('debt_notices.dismiss') }}
    </Button>
  </section>
</template>

<style scoped>
.debt-notices { display: grid; gap: var(--space-2); padding: var(--space-3); border: 1px solid var(--border-strong); border-radius: var(--design-radius-xl); background: var(--bg-deep); }
.debt-notices h3, .debt-notices h4, .debt-notices p { margin: 0; }
.debt-notices article { display: grid; gap: var(--space-2); padding: var(--space-3); border-radius: var(--design-radius-lg); background: var(--surface-1); }
.debt-notices ol { display: grid; gap: var(--space-1); margin: 0; padding-inline-start: var(--space-5); }
.debt-notices li { padding-inline-start: var(--space-1); }
.debt-notices--history { max-height: 220px; overflow: auto; scrollbar-color: var(--border-strong) var(--bg-deep); scrollbar-width: thin; }
</style>
