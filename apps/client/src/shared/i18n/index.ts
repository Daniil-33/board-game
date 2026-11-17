/// <reference types="vite/client" />
import { createI18n } from 'vue-i18n';

type LocaleResource = { [key: string]: string | LocaleResource };
export const messages: Record<string, LocaleResource> = {};
export const i18n = createI18n({ legacy: false, locale: 'ru', fallbackLocale: 'ru', messages });
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
export const t = (key: string, params: Record<string, unknown> = {}): string => i18n.global.t(key, params);
