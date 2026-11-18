import { defineAsyncComponent, defineComponent, h, type AsyncComponentLoader } from 'vue';
import { t } from '../shared/i18n/index';
import GameChunkError from './GameChunkError.vue';

const GameLoading = defineComponent({
  setup: () => () => h('div', { class: 'game-loading', role: 'status', 'data-testid': 'game-loading' }, t('game.loading')),
});

export function createGameScreenAsyncComponent<T extends object>(loader: AsyncComponentLoader<T>) {
  return defineAsyncComponent({
    loader,
    loadingComponent: GameLoading,
    errorComponent: GameChunkError,
    onError: (_error, retry, fail, attempts) => attempts <= 1 ? retry() : fail(),
    delay: 0,
  });
}
