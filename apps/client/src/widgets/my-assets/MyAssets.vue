<script setup lang="ts">
import { computed } from 'vue';
import type { BoardAsset } from '@game/game-core';
import { houseControls, mortgageControls, type ActionContext, type Intent } from '../../entities/game/index';
import { formatMoney, logoMonogram, logoUrl } from '../../shared/lib/index';
import { Button } from '../../shared/ui/index';
import { t } from '../../shared/i18n/index';

const props = defineProps<{ context: ActionContext }>();
const emit = defineEmits<{ command: [intent: Intent]; inspect: [cellIndex: number, opener: HTMLElement] }>();

interface OwnedAsset {
  asset: BoardAsset;
  cellIndex: number;
  logo: string | null;
  houses: number;
  mortgaged: boolean;
  house: ReturnType<typeof houseControls>;
  mortgage: ReturnType<typeof mortgageControls>;
}

const groups = computed(() => {
  const { view, me } = props.context;
  const assets: OwnedAsset[] = [];
  for (const { asset, index } of view?.board?.cells ?? []) {
    if (!asset || view?.owners[asset.assetId] !== me || me === null) continue;
    assets.push({
      asset,
      cellIndex: index,
      logo: logoUrl(asset.assetId, { dark: true }),
      houses: view.houses[asset.assetId] ?? 0,
      mortgaged: Object.hasOwn(view.mortgages, asset.assetId),
      house: houseControls(props.context, asset.assetId),
      mortgage: mortgageControls(props.context, asset.assetId),
    });
  }
  return [...new Set(assets.map(({ asset }) => asset.groupId))].map(id => ({
    id,
    assets: assets.filter(({ asset }) => asset.groupId === id),
  }));
});
</script>

<template>
  <section class="game-surface" data-testid="my-assets">
    <h2>{{ t('game_layout.my_assets') }}</h2>
    <p v-if="groups.length === 0">{{ t('game_layout.no_assets') }}</p>
    <section v-for="group in groups" :key="group.id" class="asset-group"
      :style="{ '--asset-gradient': `var(--group-${group.id.toLowerCase()})` }" data-testid="owned-group">
      <article v-for="{ asset, cellIndex, logo, houses, mortgaged, house, mortgage } in group.assets"
        :key="asset.assetId" class="owned-asset" data-testid="owned-asset" :data-asset-id="asset.assetId">
        <div class="asset-name">
          <img v-if="logo" :src="logo" alt="" width="30" height="30">
          <span v-else class="monogram" aria-hidden="true">{{ logoMonogram(asset.assetId) || asset.name.slice(0, 2) }}</span>
          <button class="asset-inspect" data-testid="owned-asset-inspect" @click="emit('inspect', cellIndex, $event.currentTarget as HTMLElement)"><strong>{{ asset.name }}</strong></button>
        </div>
        <div v-if="house" class="house-pips" data-testid="owned-house-pips"
          role="img" :aria-label="t('game_layout.house_count', { count: houses })">
          <span v-for="pip in 4" :key="pip" :class="{ filled: pip <= houses }" />
        </div>
        <p v-if="mortgaged" class="note" data-testid="owned-mortgaged">{{ t('asset_card.mortgage') }}</p>
        <div class="asset-actions">
          <template v-if="house">
            <Button data-testid="owned-build" :disabled="!house.build.enabled" :reason="house.build.reason ?? ''"
              @click="emit('command', { type: 'BuildHouse', payload: { assetId: asset.assetId } })">
              {{ t('asset_card.build_action', { cost: formatMoney(house.build.cost) }) }}
            </Button>
            <Button data-testid="owned-sell" :disabled="!house.sell.enabled" :reason="house.sell.reason ?? ''"
              @click="emit('command', { type: 'SellHouse', payload: { assetId: asset.assetId } })">
              {{ t('asset_card.sell_action', { refund: formatMoney(house.sell.refund) }) }}
            </Button>
          </template>
          <template v-if="mortgage">
            <Button data-testid="owned-mortgage" :disabled="!mortgage.mortgage.enabled" :reason="mortgage.mortgage.reason ?? ''"
              @click="emit('command', { type: 'Mortgage', payload: { assetId: asset.assetId } })">
              {{ t('asset_card.mortgage_action', { advance: formatMoney(mortgage.mortgage.advance) }) }}
            </Button>
            <Button data-testid="owned-redeem" :disabled="!mortgage.redeem.enabled" :reason="mortgage.redeem.reason ?? ''"
              @click="emit('command', { type: 'Redeem', payload: { assetId: asset.assetId } })">
              {{ t('asset_card.redeem_action', { amount: formatMoney(mortgage.redeem.amount) }) }}
            </Button>
          </template>
        </div>
      </article>
    </section>
  </section>
</template>

<style scoped>
.asset-group { border-radius: 8px; margin-top: var(--space-3); padding-top: 3px; background: var(--asset-gradient); overflow: hidden; }
.owned-asset { background: var(--bg-deep); padding: var(--space-3); }
.owned-asset + .owned-asset { border-top: 1px solid var(--border-strong); }
.asset-name, .asset-actions { display: flex; align-items: center; gap: var(--space-2); }
.asset-actions { flex-wrap: wrap; margin-top: var(--space-2); }
.asset-name img { object-fit: contain; }
.asset-inspect { border: 0; padding: 0; background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.monogram { flex: none; display: grid; place-items: center; width: 30px; height: 30px; background: var(--asset-gradient); border-radius: 4px; color: var(--surface-1); }
.house-pips { display: flex; gap: 4px; margin-top: var(--space-2); }
.house-pips span { width: 10px; height: 7px; border-radius: 2px; background: var(--surface-2); }
.house-pips .filled { background: var(--accent-mint); }
</style>
