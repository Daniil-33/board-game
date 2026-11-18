import { reactive } from 'vue';
import type { ChatMessage, History, HistoryEntry } from '@game/protocol';
import type { GameEvent } from '@game/game-core';

export type JournalItem =
  | { kind: 'event'; key: string; at: number; event: GameEvent }
  | { kind: 'chat'; key: string; at: number; message: ChatMessage };

function eventItems(entry: HistoryEntry): JournalItem[] {
  return entry.events.map((event, index) => ({
    kind: 'event', key: `event-${entry.revision}-${index}`, at: entry.at, event,
  }));
}

export function createJournal() {
  const state = reactive({ items: [] as JournalItem[], liveChat: 0, generation: 0 });
  const seenChat = new Set<number>();

  function chatItem(message: ChatMessage): JournalItem[] {
    if (seenChat.has(message.seq)) return [];
    seenChat.add(message.seq);
    return [{ kind: 'chat', key: `chat-${message.seq}`, at: message.at, message }];
  }

  function replace(history: History): void {
    seenChat.clear();
    // Stable sort ties: event revisions and event index, then chat sequence.
    state.items = [
      ...[...history.entries].sort((a, b) => a.revision - b.revision).flatMap(eventItems),
      ...[...history.chat].sort((a, b) => a.seq - b.seq).flatMap(chatItem),
    ].sort((a, b) => a.at - b.at);
    state.generation++;
  }

  return {
    state,
    replace,
    appendEvents(entry: HistoryEntry) { state.items.push(...eventItems(entry)); },
    appendChat(message: ChatMessage) {
      const items = chatItem(message);
      if (items.length === 0) return;
      state.items.push(...items);
      state.liveChat++;
    },
    clear() { replace({ entries: [], chat: [] }); },
  };
}
