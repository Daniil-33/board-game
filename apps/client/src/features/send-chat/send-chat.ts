import { checkChatText } from '@game/protocol';
import { CONNECTION_LOST, type ChatStore, type OutgoingChatReason } from '../../entities/chat/index';

/** What sends a `ChatSend`: the room connection. Returns the `clientMsgId`, or null when not connected. */
export interface ChatTransport {
  sendChat(text: string): string | null;
}

export type SendChatResult =
  | { readonly ok: true; readonly clientMsgId: string }
  | { readonly ok: false; readonly reason: OutgoingChatReason };

/**
 * Send one chat message. The text is checked locally with the server's rule
 * first; a message that fails it, or that cannot be sent because the
 * connection is down, is recorded as rejected and nothing is sent.
 */
export function sendChat(chat: ChatStore, transport: ChatTransport, raw: string): SendChatResult {
  const checked = checkChatText(raw);
  if (!checked.ok) {
    chat.addRejected(raw.trim(), checked.reason);
    return { ok: false, reason: checked.reason };
  }
  const clientMsgId = transport.sendChat(checked.text);
  if (clientMsgId === null) {
    chat.addRejected(checked.text, CONNECTION_LOST);
    return { ok: false, reason: CONNECTION_LOST };
  }
  chat.addPending(clientMsgId, checked.text);
  return { ok: true, clientMsgId };
}
