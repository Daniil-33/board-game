/// <reference types="vite/client" />
import { createI18n } from 'vue-i18n';

type LocaleResource = { [key: string]: string | LocaleResource };
export const messages: Record<string, LocaleResource> = {};
export const i18n = createI18n({
  legacy: false,
  locale: 'ru',
  fallbackLocale: 'ru',
  messages,
  pluralRules: {
    ru: (choice, choicesLength) => {
      const n = Math.abs(choice);
      const last = n % 10;
      const lastTwo = n % 100;
      if (choicesLength < 4) return last === 1 && lastTwo !== 11 ? 0 : 1;
      if (n === 0) return 0;
      if (last === 1 && lastTwo !== 11) return 1;
      if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return 2;
      return 3;
    },
  },
});
/** Called by browser composition; keeps geometry imports usable by Node tooling. */
export function registerLocales(): void {
  const resources = import.meta.glob<{ default: LocaleResource }>('./locales/*.json', { eager: true });
  for (const [path, resource] of Object.entries(resources)) {
    const locale = path.split('/').at(-1)!.replace(/\.json$/, '');
    messages[locale] = resource.default;
    i18n.global.setLocaleMessage(locale, resource.default);
  }
}
/** Shared translator for templates, presentation adapters and Pixi captions. */
export const t = (key: string, params: Record<string, unknown> = {}, plural?: number): string =>
  plural === undefined ? i18n.global.t(key, params) : i18n.global.t(key, params, plural);
