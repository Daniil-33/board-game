<script setup lang="ts">
import { formatMoney } from '../../shared/lib/index';

import { t } from '../../shared/i18n/index';
import type { GeneratedBoard } from '@game/game-core';
import { assetName, STEP_KIND_TEXT, type DebtNotice } from '../../entities/game/index';
defineProps<{ notices: readonly DebtNotice[]; nameOf: (id: string) => string; board?: GeneratedBoard | null }>();
</script>
<template>
  <section v-if="notices.length" class="debt-notices" :aria-label="t('debt_notices.debt_notices')" data-testid="debt-notices">
    <h3>{{ t('debt_notices.debt_settlements') }}</h3>
    <article v-for="(notice, index) in notices" :key="index" :data-testid="notice.kind">
      <template v-if="notice.kind === 'liquidation'">
        <h4 data-testid="debt-notice-title">{{ t('debt_notices.liquidation', { value0: nameOf(notice.payerId) }) }}</h4>
        <p data-testid="liquidation-debt">{{ t('debt_notices.owes', { value0: nameOf(notice.creditorId), value1: formatMoney(notice.debt) }) }}</p>
        <ol>
          <li v-for="(step, i) in notice.steps" :key="i" data-testid="liquidation-step"> {{ t('debt_notices.tier_of', { value0: step.tier, value1: STEP_KIND_TEXT[step.kind], value2: assetName(board, step.assetId), value3: formatMoney(step.amount) }) }}
          </li>
        </ol>
        <p data-testid="liquidation-total">{{ t('debt_notices.raised_paid', { value0: formatMoney(notice.raised), value1: notice.payment === null ? t('debt_notices.not_reported') : formatMoney(notice.payment) }) }}</p>
      </template>
      <template v-else>
        <h4 data-testid="debt-notice-title">{{ t('debt_notices.bankruptcy', { value0: nameOf(notice.playerId) }) }}</h4>
        <p data-testid="bankruptcy-amounts">{{ t('debt_notices.owed_paid_written', { value0: nameOf(notice.creditorId), value1: formatMoney(notice.debt), value2: formatMoney(notice.paid), value3: formatMoney(notice.writtenOff) }) }}</p>
        <p data-testid="bankruptcy-assets">{{ t('debt_notices.freed_assets', { value0: notice.assetIds.map(id => assetName(board, id)).join(', ') || t('debt_notices.none') }) }}</p>
      </template>
    </article>
  </section>
</template>
