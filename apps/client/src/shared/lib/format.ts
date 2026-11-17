import { i18n } from '../i18n/index';

/** Preserve the existing ungrouped integer display without currency conversion. */
export function formatMoney(value: number | undefined): string {
  if (value === undefined) return '';
  return new Intl.NumberFormat(i18n.global.locale.value, { useGrouping: false, maximumFractionDigits: 0 }).format(value);
}
export function formatSeconds(seconds: number): string {
  return new Intl.NumberFormat(i18n.global.locale.value, { useGrouping: false, maximumFractionDigits: 0 }).format(seconds);
}
/** Server epoch time, retaining the existing UTC date/time presentation. */
export function formatTime(at: number): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return String(at);
  const parts = new Intl.DateTimeFormat(i18n.global.locale.value, {
    timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')}:${part('second')} UTC`;
}
