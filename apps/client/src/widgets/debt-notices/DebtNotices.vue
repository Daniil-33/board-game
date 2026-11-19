<script setup lang="ts">
import { formatMoney } from '../../shared/lib/index';

import { t } from '../../shared/i18n/index';
import type { GeneratedBoard } from '@game/game-core';
import { assetName, liquidationStepText, type DebtNotice } from '../../entities/game/index';
defineProps<{ notices: readonly DebtNotice[]; nameOf: (id: string) => string; board?: GeneratedBoard | null }>();
</script>
<template>
  <section v-if="notices.length" class="debt-notices" :aria-label="t('debt_notices.debt_notices')" data-testid="debt-notices">
    <h3>{{ t('debt_notices.debt_settlements') }}</h3>
    <article v-for="(notice, index) in notices" :key="index" :data-testid="notice.kind">
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
  </section>
</template>

<style scoped>
.debt-notices { display: grid; gap: var(--space-2); padding: var(--space-3); border: 1px solid var(--border-strong); border-radius: var(--design-radius-xl); background: var(--bg-deep); }
.debt-notices h3, .debt-notices h4, .debt-notices p { margin: 0; }
.debt-notices article { display: grid; gap: var(--space-2); padding: var(--space-3); border-radius: var(--design-radius-lg); background: var(--surface-1); }
.debt-notices ol { display: grid; gap: var(--space-1); margin: 0; padding-inline-start: var(--space-5); }
.debt-notices li { padding-inline-start: var(--space-1); }
</style>
