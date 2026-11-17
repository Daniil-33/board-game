import { t } from '../../shared/i18n/index';
import { formatMoney, formatTime as sharedFormatTime } from '../../shared/lib/index';
/**
 * Debt notices: presentation of the public LiquidationApplied and
 * PlayerBankrupt events of one accepted update. Every amount, step and freed
 * asset comes from the events; nothing is reconstructed from state
 * differences and no game outcome is computed here.
 */
import type { AssetId, GeneratedBoard, LiquidationStep, PlayerId, StateView } from '@game/game-core';

/** A wire event as the connection hands it over; payloads are checked here. */
interface WireEvent { readonly type: string; readonly payload: unknown }
type Fields = Record<string, unknown>;

export interface LiquidationNotice {
  readonly kind: 'liquidation';
  readonly payerId: PlayerId;
  readonly creditorId: PlayerId;
  readonly debt: number;
  /** Steps in event order. */
  readonly steps: readonly LiquidationStep[];
  readonly raised: number;
  /** The amount of the matching RentPaid of the same update; null when the update has none. */
  readonly payment: number | null;
}

export interface BankruptcyNotice {
  readonly kind: 'bankruptcy';
  readonly playerId: PlayerId;
  readonly creditorId: PlayerId;
  readonly debt: number;
  readonly paid: number;
  readonly writtenOff: number;
  /** From the player's bankrupt AssetsReleased of the same update; empty when there is none. */
  readonly assetIds: readonly AssetId[];
}

export type DebtNotice = LiquidationNotice | BankruptcyNotice;

/** How many notices a room session keeps; older ones are dropped first. */
export const NOTICE_LIMIT = 50;

const object = (v: unknown): v is Fields => v !== null && typeof v === 'object' && !Array.isArray(v);
const money = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const id = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const TIERS: readonly unknown[] = [1, 2, 3];

function isStep(v: unknown): v is LiquidationStep {
  return object(v) && TIERS.includes(v.tier) && (v.kind === 'mortgage' || v.kind === 'sell-house') && id(v.assetId) && money(v.amount);
}

function payment(events: readonly WireEvent[], payerId: string, creditorId: string): number | null {
  for (const e of events) {
    if (e.type === 'RentPaid' && object(e.payload) && e.payload.payerId === payerId && e.payload.ownerId === creditorId && money(e.payload.amount)) return e.payload.amount;
  }
  return null;
}

function released(events: readonly WireEvent[], playerId: string): AssetId[] {
  for (const e of events) {
    const p = e.payload;
    if (e.type === 'AssetsReleased' && object(p) && p.playerId === playerId && p.reason === 'bankrupt' && Array.isArray(p.assetIds) && p.assetIds.every(id)) return [...p.assetIds] as AssetId[];
  }
  return [];
}

/** The notices of one update's events, in event order. A malformed payload yields no notice. */
export function debtNotices(events: readonly WireEvent[]): DebtNotice[] {
  const notices: DebtNotice[] = [];
  for (const event of events) {
    const p = event.payload;
    if (!object(p) || !id(p.creditorId) || !money(p.debt)) continue;
    if (event.type === 'LiquidationApplied' && id(p.payerId) && money(p.raised) && Array.isArray(p.steps) && p.steps.every(isStep)) {
      notices.push({
        kind: 'liquidation', payerId: p.payerId as PlayerId, creditorId: p.creditorId as PlayerId, debt: p.debt,
        steps: p.steps.map((s: LiquidationStep) => ({ tier: s.tier, kind: s.kind, assetId: s.assetId, amount: s.amount })),
        raised: p.raised, payment: payment(events, p.payerId, p.creditorId),
      });
    } else if (event.type === 'PlayerBankrupt' && id(p.playerId) && money(p.paid) && money(p.writtenOff)) {
      notices.push({
        kind: 'bankruptcy', playerId: p.playerId as PlayerId, creditorId: p.creditorId as PlayerId, debt: p.debt,
        paid: p.paid, writtenOff: p.writtenOff, assetIds: released(events, p.playerId),
      });
    }
  }
  return notices;
}

/** `list` with `added` appended, keeping the newest NOTICE_LIMIT entries. Mutates `list`. */
export function appendNotices(list: DebtNotice[], added: readonly DebtNotice[]): void {
  list.push(...added);
  if (list.length > NOTICE_LIMIT) list.splice(0, list.length - NOTICE_LIMIT);
}

/** The asset's projected name, or its id when the board does not list it. */
export function assetName(board: GeneratedBoard | null | undefined, assetId: string): string {
  return board?.cells.find(c => c.asset?.assetId === assetId)?.asset?.name ?? assetId;
}

const ELIMINATION_TEXT: Readonly<Record<'resigned' | 'bankrupt', string>> = {
  get resigned() { return t('debts.resigned'); },
  get bankrupt() { return t('debts.bankrupt'); },
};

/** The eliminated viewer's line, with the projected reason when the view records one. */
export function eliminationText(view: StateView, playerId: string, watching = false): string {
  const entry = view.eliminations?.find(e => e.playerId === playerId);
  if (watching) return entry === undefined ? t('debts.spectator') : entry.reason === 'resigned' ? t('debts.spectator_resigned') : t('debts.spectator_bankrupt');
  return entry ? ELIMINATION_TEXT[entry.reason] : t('debts.eliminated');
}

/** A server timestamp (epoch milliseconds) as UTC time. */
export function formatTime(at: number): string {
  return sharedFormatTime(at);
}

/** Kind-specific whole messages let translations choose word order and grammar. */
export function liquidationStepText(step: LiquidationStep, board?: GeneratedBoard | null): string {
  const params = { tier: step.tier, asset: assetName(board, step.assetId), amount: formatMoney(step.amount) };
  return step.kind === 'mortgage' ? t('debts.mortgage_step', params) : t('debts.house_sale_step', params);
}
