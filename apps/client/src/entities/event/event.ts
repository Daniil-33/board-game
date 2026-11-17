import { reactive } from 'vue';
import type { HistoryEntry } from '@game/protocol';

/** The viewer's event log: one entry per log entry that has visible events, oldest first. */
export interface EventLogState {
  entries: HistoryEntry[];
}

export interface EventLog {
  readonly state: EventLogState;
  /** A `Welcome`: the log becomes `entries`. Nothing is animated. */
  replace(entries: readonly HistoryEntry[]): void;
  /** An `Update` with events. An entry at or below the last revision is ignored. */
  append(entry: HistoryEntry): void;
  clear(): void;
}

export function createEventLog(): EventLog {
  const state = reactive<EventLogState>({ entries: [] });
  return {
    state,
    replace(entries) {
      state.entries.splice(0, state.entries.length, ...entries.map((e) => ({ ...e, events: [...e.events] })));
    },
    append(entry) {
      if (entry.events.length === 0) return;
      const last = state.entries[state.entries.length - 1];
      if (last !== undefined && entry.revision <= last.revision) return;
      state.entries.push({ ...entry, events: [...entry.events] });
    },
    clear() {
      state.entries.splice(0);
    },
  };
}
