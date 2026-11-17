import { flushPromises } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import type { ChatMessage, HistoryEntry, ServerFrame } from '@game/protocol';
import type { Revision } from '@game/game-core';
import { CONNECTION_LOST, createChatStore } from '../entities/chat/index';
import { createEventLog } from '../entities/event/index';
import { sendChat } from '../features/send-chat/index';
import { harness, lobbyView, pid, playingView, room, storedSession, update, welcome } from './helpers';

const msg = (seq: number, text = `m${seq}`, authorId = 'a'): ChatMessage => ({ seq, authorId: pid(authorId), text, at: 1000 + seq });
const entry = (revision: number, types: string[] = ['TurnEnded']): HistoryEntry => ({
  revision: revision as Revision,
  at: 2000 + revision,
  events: types.map((type) => ({ type, payload: null })),
});

// spec: client/chat "Chat store"
describe('chat store', () => {
  it('keeps messages ordered by seq without duplicates', () => {
    const chat = createChatStore();
    chat.receive(msg(2));
    chat.receive(msg(1));
    chat.receive(msg(2, 'again'));
    expect(chat.state.messages).toEqual([msg(1), msg(2)]);
    chat.receive(msg(5));
    chat.receive(msg(3));
    expect(chat.state.messages.map((m) => m.seq)).toEqual([1, 2, 3, 5]);
  });

  it('replace takes the Welcome history, deduplicated and sorted', () => {
    const chat = createChatStore();
    chat.receive(msg(9));
    chat.replace([msg(3), msg(1), msg(3)]);
    expect(chat.state.messages.map((m) => m.seq)).toEqual([1, 3]);
  });

  it('an ok ack removes the outgoing entry, a rejection marks it with the reason', () => {
    const chat = createChatStore();
    chat.addPending('x', 'hello');
    chat.addPending('y', 'spam');
    chat.acknowledge({ t: 'ChatAck', clientMsgId: 'x', ok: true });
    chat.acknowledge({ t: 'ChatAck', clientMsgId: 'y', ok: false, reason: 'RATE_LIMITED' });
    chat.acknowledge({ t: 'ChatAck', clientMsgId: 'unknown', ok: true });
    expect(chat.state.outgoing).toEqual([{ clientMsgId: 'y', text: 'spam', status: 'rejected', reason: 'RATE_LIMITED' }]);
    chat.dismiss('y');
    expect(chat.state.outgoing).toEqual([]);
  });

  it('a new Welcome turns pending messages into CONNECTION_LOST and keeps earlier rejections', () => {
    const chat = createChatStore();
    chat.addPending('x', 'in flight');
    chat.addRejected('', 'EMPTY');
    chat.replace([msg(1)]);
    expect(chat.state.outgoing).toEqual([
      { clientMsgId: 'x', text: 'in flight', status: 'rejected', reason: CONNECTION_LOST },
      { clientMsgId: 'local-1', text: '', status: 'rejected', reason: 'EMPTY' },
    ]);
    // A late ack for it changes nothing.
    chat.acknowledge({ t: 'ChatAck', clientMsgId: 'x', ok: true });
    expect(chat.state.outgoing).toHaveLength(2);
  });

  it('clear drops messages and outgoing entries', () => {
    const chat = createChatStore();
    chat.receive(msg(1));
    chat.addPending('x', 'a');
    chat.clear();
    expect(chat.state).toEqual({ messages: [], outgoing: [] });
  });
});

// spec: client/chat "Event log store"
describe('event log', () => {
  it('replace takes the history; append adds newer entries with events only', () => {
    const log = createEventLog();
    log.replace([entry(2), entry(4)]);
    log.append(entry(4));
    log.append(entry(3));
    log.append({ ...entry(5), events: [] });
    log.append(entry(6, ['DiceRolled', 'PlayerMoved']));
    expect(log.state.entries).toEqual([entry(2), entry(4), entry(6, ['DiceRolled', 'PlayerMoved'])]);
    log.replace([entry(1)]);
    expect(log.state.entries).toEqual([entry(1)]);
    log.clear();
    expect(log.state.entries).toEqual([]);
  });
});

// spec: client/chat "Send chat action"
describe('send-chat', () => {
  const transport = (connected: boolean) => {
    const sent: string[] = [];
    return { sent, sendChat: (text: string) => (connected ? (sent.push(text), `id-${sent.length}`) : null) };
  };

  it('an invalid text is rejected locally and nothing is sent', () => {
    const chat = createChatStore();
    const t = transport(true);
    expect(sendChat(chat, t, '   ')).toEqual({ ok: false, reason: 'EMPTY' });
    expect(sendChat(chat, t, 'a\tb')).toEqual({ ok: false, reason: 'CONTROL_CHARACTER' });
    expect(sendChat(chat, t, 'x'.repeat(301))).toEqual({ ok: false, reason: 'TOO_LONG' });
    expect(sendChat(chat, t, '1\n2\n3\n4\n5')).toEqual({ ok: false, reason: 'TOO_MANY_LINES' });
    expect(t.sent).toEqual([]);
    expect(chat.state.outgoing.map((o) => [o.status, o.reason])).toEqual([
      ['rejected', 'EMPTY'], ['rejected', 'CONTROL_CHARACTER'], ['rejected', 'TOO_LONG'], ['rejected', 'TOO_MANY_LINES'],
    ]);
  });

  it('sends the trimmed text and records it pending', () => {
    const chat = createChatStore();
    const t = transport(true);
    expect(sendChat(chat, t, '  hi  ')).toEqual({ ok: true, clientMsgId: 'id-1' });
    expect(t.sent).toEqual(['hi']);
    expect(chat.state.outgoing).toEqual([{ clientMsgId: 'id-1', text: 'hi', status: 'pending' }]);
  });

  it('while disconnected nothing is sent and the entry is rejected', () => {
    const chat = createChatStore();
    expect(sendChat(chat, transport(false), 'hi')).toEqual({ ok: false, reason: CONNECTION_LOST });
    expect(chat.state.outgoing).toMatchObject([{ text: 'hi', status: 'rejected', reason: CONNECTION_LOST }]);
  });
});

// spec: client/chat "Chat store", "Event log store" through the connection
describe('client wiring', () => {
  const withHistory = (frame: ServerFrame, entries: HistoryEntry[], chat: ChatMessage[]): ServerFrame =>
    frame.t === 'Welcome' ? { ...frame, history: { entries, chat } } : frame;

  function joined() {
    const h = harness({ stored: storedSession(room([['a', 'Alice'], ['b', 'Bob']])) });
    h.client.start();
    h.sockets.last().open();
    return h;
  }

  it('Welcome fills the event log and chat without queuing animation', async () => {
    const h = joined();
    h.client.attachBoard(h.board);
    const history = [entry(3, ['DiceRolled', 'PlayerMoved']), entry(5)];
    const view = playingView(['a', 'b'], { revision: 6 });
    h.sockets.last().receive(withHistory(welcome(view), history, [msg(1), msg(2)]));
    await flushPromises();
    expect(h.client.events.state.entries).toEqual(history);
    expect(h.client.chat.state.messages).toEqual([msg(1), msg(2)]);
    expect(h.board.steps).toEqual([]);
  });

  it('an Update with events appends one entry stamped on receipt; Chat frames reach the store', () => {
    const h = joined();
    h.sockets.last().receive(welcome(lobbyView(['a', 'b'], 2)));
    h.clock.now = 77_000;
    h.sockets.last().receive(update(lobbyView(['a', 'b'], 3), [{ type: 'TurnEnded', payload: null }]));
    h.sockets.last().receive(update(lobbyView(['a', 'b'], 4), []));
    expect(h.client.events.state.entries).toEqual([{ revision: 3, at: 77_000, events: [{ type: 'TurnEnded', payload: null }] }]);
    h.sockets.last().receive({ t: 'Chat', message: msg(4, 'hey', 'b') });
    h.sockets.last().receive({ t: 'Chat', message: msg(4, 'hey', 'b') });
    expect(h.client.chat.state.messages).toEqual([msg(4, 'hey', 'b')]);
  });

  it('sends ChatSend over the connection; the ack clears it; a pending message is not resent after a reconnect', () => {
    const h = joined();
    const socket = h.sockets.last();
    expect(sendChat(h.client.chat, h.client.connection, 'before welcome')).toEqual({ ok: false, reason: CONNECTION_LOST });
    expect(socket.sent.filter((f) => f.t === 'ChatSend')).toEqual([]);

    socket.receive(welcome(lobbyView(['a', 'b'], 2)));
    const first = sendChat(h.client.chat, h.client.connection, ' one ');
    expect(first).toEqual({ ok: true, clientMsgId: 'c1' });
    expect(socket.sent.filter((f) => f.t === 'ChatSend')).toEqual([{ t: 'ChatSend', clientMsgId: 'c1', text: 'one' }]);
    socket.receive({ t: 'Chat', message: msg(1, 'one') });
    socket.receive({ t: 'ChatAck', clientMsgId: 'c1', ok: true });
    expect(h.client.chat.state.outgoing.filter((o) => o.status === 'pending')).toEqual([]);

    sendChat(h.client.chat, h.client.connection, 'two');
    socket.drop();
    expect(sendChat(h.client.chat, h.client.connection, 'offline')).toEqual({ ok: false, reason: CONNECTION_LOST });
    expect(socket.sent.filter((f) => f.t === 'ChatSend').map((f) => f.t === 'ChatSend' && f.text)).toEqual(['one', 'two']);
  });

  it('on a new Welcome the pending message becomes CONNECTION_LOST and is not resent', async () => {
    const h = joined();
    h.sockets.last().receive(welcome(lobbyView(['a', 'b'], 2)));
    sendChat(h.client.chat, h.client.connection, 'in flight');
    const first = h.sockets.last();
    first.drop();
    await new Promise((resolve) => setTimeout(resolve, 600));
    const second = h.sockets.last();
    expect(second).not.toBe(first);
    second.open();
    second.receive(withHistory(welcome(lobbyView(['a', 'b'], 2)), [], [msg(1, 'in flight')]));
    expect(second.sent.map((f) => f.t)).toEqual(['Hello']);
    expect(h.client.chat.state.outgoing).toMatchObject([{ text: 'in flight', status: 'rejected', reason: CONNECTION_LOST }]);
    expect(h.client.chat.state.messages.map((m) => m.text)).toEqual(['in flight']);
  });

  it('leaving the room clears chat and the event log', () => {
    const h = joined();
    h.sockets.last().receive(withHistory(welcome(lobbyView(['a', 'b'], 2)), [entry(1)], [msg(1)]));
    h.client.returnToLobby();
    expect(h.client.chat.state).toEqual({ messages: [], outgoing: [] });
    expect(h.client.events.state.entries).toEqual([]);
  });
});
