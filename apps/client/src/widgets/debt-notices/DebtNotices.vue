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
