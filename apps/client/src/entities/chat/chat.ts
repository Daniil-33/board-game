import { reactive } from 'vue';
import type { ChatAckFrame, ChatMessage, ChatRejectReason } from '@game/protocol';

/** Local reason: the connection was replaced before the server answered; the history shows whether it landed. */
export const CONNECTION_LOST = 'CONNECTION_LOST';
export type OutgoingChatReason = ChatRejectReason | typeof CONNECTION_LOST;

/** A message this viewer sent that is not in `messages` yet, or was rejected. */
export interface OutgoingChat {
  readonly clientMsgId: string;
  readonly text: string;
  status: 'pending' | 'rejected';
  reason?: OutgoingChatReason;
}

export interface ChatState {
  /** The room's messages, ascending by `seq`, without duplicates. */
  messages: ChatMessage[];
  outgoing: OutgoingChat[];
}

export interface ChatStore {
  readonly state: ChatState;
  /**
   * A `Welcome`: the messages become `history`; still-pending outgoing
   * messages become rejected with `CONNECTION_LOST` (they are not resent).
   */
  replace(history: readonly ChatMessage[]): void;
  /** A `Chat` frame. A known `seq` is ignored. */
  receive(message: ChatMessage): void;
  /** A `ChatAck`: ok removes the outgoing entry, a rejection marks it. Unknown ids are ignored. */
  acknowledge(ack: ChatAckFrame): void;
  /** Record a message sent with `clientMsgId` and waiting for its ack. */
  addPending(clientMsgId: string, text: string): void;
  /** Record a message that was not sent at all. */
  addRejected(text: string, reason: OutgoingChatReason): void;
  /** Forget an outgoing entry (the user dismissed it). */
  dismiss(clientMsgId: string): void;
  /** Leave the room: drop everything. */
  clear(): void;
}

export function createChatStore(): ChatStore {
  const state = reactive<ChatState>({ messages: [], outgoing: [] });
  let localId = 0;

  function insert(message: ChatMessage): void {
    const list = state.messages;
    // Messages nearly always arrive in order: search from the end.
    let i = list.length;
    while (i > 0 && list[i - 1]!.seq > message.seq) i--;
    if (i > 0 && list[i - 1]!.seq === message.seq) return;
    list.splice(i, 0, { ...message });
  }

  return {
    state,
    replace(history) {
      state.messages.splice(0);
      for (const message of history) insert(message);
      for (const entry of state.outgoing) {
        if (entry.status === 'pending') {
          entry.status = 'rejected';
          entry.reason = CONNECTION_LOST;
        }
      }
    },
    receive: insert,
    acknowledge(ack) {
      const index = state.outgoing.findIndex((o) => o.clientMsgId === ack.clientMsgId && o.status === 'pending');
      if (index < 0) return;
      if (ack.ok) state.outgoing.splice(index, 1);
      else {
        const entry = state.outgoing[index]!;
        entry.status = 'rejected';
        entry.reason = ack.reason;
      }
    },
    addPending(clientMsgId, text) {
      state.outgoing.push({ clientMsgId, text, status: 'pending' });
    },
    addRejected(text, reason) {
      state.outgoing.push({ clientMsgId: `local-${++localId}`, text, status: 'rejected', reason });
    },
    dismiss(clientMsgId) {
      const index = state.outgoing.findIndex((o) => o.clientMsgId === clientMsgId);
      if (index >= 0) state.outgoing.splice(index, 1);
    },
    clear() {
      state.messages.splice(0);
      state.outgoing.splice(0);
    },
  };
}
