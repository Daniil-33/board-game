import ru from './locales/ru.json';
import en from './locales/en.json';
import { i18n } from '../../shared/i18n/index';

/** Registered with the lazy game route so stage 6 copy does not load in the lobby. */
export function registerSpecialCellLocales(): void {
  i18n.global.mergeLocaleMessage('ru', ru);
  i18n.global.mergeLocaleMessage('en', en);
}
