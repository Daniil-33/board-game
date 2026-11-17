<script setup lang="ts">
import type { GeneratedBoard } from '@game/game-core';
import { assetName, STEP_KIND_TEXT, type DebtNotice } from '../game/debts';
defineProps<{ notices: readonly DebtNotice[]; nameOf: (id: string) => string; board?: GeneratedBoard | null }>();
</script>
<template>
  <section v-if="notices.length" class="debt-notices" aria-label="Debt notices" data-test="debt-notices">
    <h3>Debt settlements</h3>
    <article v-for="(notice, index) in notices" :key="index" :data-test="notice.kind">
      <template v-if="notice.kind === 'liquidation'">
        <h4>Liquidation: {{ nameOf(notice.payerId) }}</h4>
        <p data-test="liquidation-debt">Owes {{ nameOf(notice.creditorId) }} {{ notice.debt }}.</p>
        <ol>
          <li v-for="(step, i) in notice.steps" :key="i" data-test="liquidation-step">
            Tier {{ step.tier }}: {{ STEP_KIND_TEXT[step.kind] }} of {{ assetName(board, step.assetId) }}, +{{ step.amount }}
          </li>
        </ol>
        <p data-test="liquidation-total">Raised {{ notice.raised }}. Paid {{ notice.payment ?? 'not reported' }}.</p>
      </template>
      <template v-else>
        <h4>Bankruptcy: {{ nameOf(notice.playerId) }}</h4>
        <p data-test="bankruptcy-amounts">Owed {{ nameOf(notice.creditorId) }} {{ notice.debt }}: paid {{ notice.paid }}, written off {{ notice.writtenOff }}.</p>
        <p data-test="bankruptcy-assets">Freed assets: {{ notice.assetIds.map(id => assetName(board, id)).join(', ') || 'none' }}</p>
      </template>
    </article>
  </section>
</template>
