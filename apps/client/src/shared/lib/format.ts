import { i18n } from '../i18n/index';

/** Format integer money with locale grouping and a thin space in Russian. */
export function formatMoney(value: number | undefined): string {
  if (value === undefined) return '';
  const locale = i18n.global.locale.value;
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).formatToParts(value)
    .map(part => locale.startsWith('ru') && part.type === 'group' ? '\u2009' : part.value).join('');
}
export function formatSeconds(seconds: number): string {
  return new Intl.NumberFormat(i18n.global.locale.value, { useGrouping: false, maximumFractionDigits: 0 }).format(seconds);
}
/** Format server epoch time in the active locale, keeping the displayed zone in UTC. */
export function formatTime(at: number): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return String(at);
  const formatted = new Intl.DateTimeFormat(i18n.global.locale.value, {
    timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).format(date);
  return `${formatted} UTC`;
}
