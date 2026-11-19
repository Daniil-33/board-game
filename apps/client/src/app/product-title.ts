import { i18n } from '../shared/i18n/index';

export function updateProductTitle(target: Pick<Document, 'title'> = document): void {
  target.title = i18n.global.t('app.board_game');
}
