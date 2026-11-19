import { DOMWrapper, flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { h, ref } from 'vue';
import type { AssetId, Money, Revision, StateView } from '@game/game-core';
import { App, GAME_OVER_SCREEN_OVERRIDE_KEY, GAME_SCREEN_OVERRIDE_KEY } from '../app/index';
import { GameScreen } from '../pages/game/index';
import { GameOverScreen } from '../pages/game-over/index';
import { createChatStore } from '../entities/chat/index';
import { describeEvent, type JournalItem } from '../entities/event/index';
import { canIssue, houseControls, mortgageControls, type ActionContext, type Intent } from '../entities/game/index';
import { BOARD_MOUNT_KEY, CLIENT_KEY } from '../features/client-session/index';
import { ChatComposer } from '../features/send-chat/index';
import { EventFeed } from '../widgets/event-feed/index';
import { MyAssets } from '../widgets/my-assets/index';
import { MyTurn } from '../widgets/my-turn/index';
import { PlayerPanel } from '../widgets/players-panel/index';
import { Hud } from '../widgets/turn-header/index';
import { harness, pid, playingView, room, storedSession, update, welcome, withUi } from './helpers';

const hook = (id: string) => `[data-testid="${id}"]`;
const nameOf = (id: string) => id === 'a' ? 'Alice' : 'Bob';
const now = 50_000;

function game() {
  const clientHarness = harness({ stored: storedSession(room([['a', 'Alice'], ['b', 'Bob']])) });
  clientHarness.client.start();
  clientHarness.sockets.last().open();
  return clientHarness;
}

function mountGame(test: ReturnType<typeof game>) {
  return mount(App, { attachTo: document.body, global: { provide: {
    [CLIENT_KEY as symbol]: test.client, [BOARD_MOUNT_KEY as symbol]: test.mount,
    [GAME_SCREEN_OVERRIDE_KEY as symbol]: GameScreen, [GAME_OVER_SCREEN_OVERRIDE_KEY as symbol]: GameOverScreen,
  } } });
}

describe('game presentation', () => {
  it('uses projected seat colors and counts only houses belonging to each player', () => {
    const base = playingView(['a', 'b', 'c']);
    const [first, second, third] = base.board!.cells.flatMap(cell => cell.asset ? [cell.asset.assetId] : []);
    const view = {
      ...base, order: [pid('b'), pid('a')], eliminated: [pid('c')],
      turn: { ...base.turn!, pausedRemainingMs: 0 },
      houses: { [first!]: 2, [second!]: 1, [third!]: 4 },
      owners: { [first!]: pid('a'), [second!]: pid('b') },
      rent: { payerId: pid('a'), ownerId: pid('b'), assetId: first!, cell: 1, kind: 'regular' as const, amount: 100 as Money, diceSum: null },
    };
    const panel = mount(PlayerPanel, { props: { view, nameOf } });
    const rows = panel.findAll(hook('player-balance'));
    expect(rows.map(row => row.attributes('style'))).toEqual([1, 2, 3].map(seat => `--seat-color: var(--player-${seat});`));
    expect(rows.map(row => row.get(hook('player-houses')).text())).toEqual(['2 дома', '1 дом', '0 домов']);
    expect(rows[0]!.find(hook('player-debt')).exists()).toBe(true);
    expect(rows[0]!.find(hook('player-active')).exists()).toBe(true);
    expect(rows[0]!.get(hook('player-paused')).text()).toBe('таймер хода на паузе');
    expect(rows[1]!.find(hook('player-debt')).exists()).toBe(false);
    expect(rows[2]!.find(hook('player-eliminated')).exists()).toBe(true);
    const header = mount(Hud, { props: { view, me: pid('a'), now, connected: true, pending: [], nameOf, colorOf: () => '', messages: [], problem: null, fatal: null } });
    expect(header.get(hook('timer')).text()).toBe(rows[0]!.get(hook('player-paused')).text());
    panel.unmount();
    header.unmount();
  });

  it('makes the available roll or end turn primary and preserves disabled reasons', async () => {
    const view = playingView(['a', 'b']);
    const context = ref<ActionContext>({ view, me: pid('a'), now, connected: true, pending: [] });
    const w = mount(withUi(() => h(MyTurn, { context: context.value })));
    expect(w.get(hook('RollDice')).classes()).toContain('primary');
    expect(w.get(hook('EndTurn')).classes()).toContain('secondary');
    expect(w.find(hook('RollForOrder')).exists()).toBe(false);
    expect(w.get(`[id="${w.get(hook('EndTurn')).attributes('aria-describedby')}"]`).text()).toContain('Кости ещё не брошены');
    expect(w.get(hook('EndTurn')).attributes('aria-describedby')).toBeTruthy();
    context.value = { ...context.value, view: { ...view, turn: { ...view.turn!, rolled: true } } };
    await flushPromises();
    expect(w.get(hook('EndTurn')).classes()).toContain('primary');
    expect(w.get(hook('EndTurn')).attributes('disabled')).toBeUndefined();
    expect(w.get(`[id="${w.get(hook('RollDice')).attributes('aria-describedby')}"]`).text()).toContain('Кости уже брошены в этом ходу');
    context.value = { ...context.value, connected: false };
    await flushPromises();
    for (const type of ['RollDice', 'EndTurn']) {
      const button = w.get(hook(type));
      expect(button.attributes('disabled')).toBeDefined();
      expect(w.get(`[id="${button.attributes('aria-describedby')}"]`).text()).toContain('переподключаемся');
    }
    expect(canIssue(context.value, 'EndTurn')).toBe(false);
    for (const restriction of [
      { connected: true, pending: ['EndTurn'] as const },
      { connected: true, now: view.turn!.deadline },
      { connected: true, me: pid('b') },
    ]) {
      const before = context.value;
      context.value = { ...before, ...restriction };
      await flushPromises();
      for (const type of ['RollDice', 'EndTurn']) expect(w.get(hook(type)).attributes('disabled')).toBeDefined();
      context.value = before;
      await flushPromises();
    }
    w.unmount();
  });

  it('uses the asset adapters for button reasons and shows projected house pips', async () => {
    const view = playingView(['a', 'b']);
    const asset = view.board!.cells[1]!.asset!;
    const context = {
      view: { ...view, owners: { [asset.assetId]: pid('a') }, houses: { [asset.assetId]: 1 } },
      me: pid('a'), now, connected: true, pending: [],
    };
    const inspect = vi.fn();
    const w = mount(withUi(() => h(MyAssets, { context, onInspect: inspect })));
    expect(w.get(hook('owned-group')).attributes('style')).toContain('--group-m1');
    expect(w.get(hook('owned-house-pips')).findAll('.filled')).toHaveLength(1);
    const opener = w.get(hook('owned-asset-inspect'));
    await opener.trigger('click');
    expect(inspect).toHaveBeenCalledWith(1, opener.element);
    const reasons = {
      'owned-build': houseControls(context, asset.assetId)!.build.reason,
      'owned-mortgage': mortgageControls(context, asset.assetId)!.mortgage.reason,
      'owned-redeem': mortgageControls(context, asset.assetId)!.redeem.reason,
    };
    for (const [id, reason] of Object.entries(reasons)) {
      const button = w.get(hook(id));
      expect(button.attributes('disabled')).toBeDefined();
      expect(w.get(`[id="${button.attributes('aria-describedby')}"]`).text()).toBe(reason);
    }
    w.unmount();
  });

  it('sends the four existing asset commands with the selected asset id', async () => {
    const base = playingView(['a', 'b']);
    const cells = base.board!.cells.filter(cell => cell.asset?.groupId === 'M1');
    const assetId = cells[0]!.asset!.assetId;
    const owners = Object.fromEntries(cells.map(cell => [cell.asset!.assetId, pid('a')]));
    const view = ref<StateView>({ ...base, owners });
    const sent: Intent[] = [];
    const w = mount(withUi(() => h(MyAssets, {
      context: { view: view.value, now, me: pid('a'), pending: [], connected: true },
      onCommand: (command: Intent) => sent.push(command),
    })));
    const asset = w.get(`[data-asset-id="${assetId}"]`);
    expect(asset.find('img').attributes('src')).toContain('-dark');
    const click = async (hookId: string) => {
      const button = asset.get(hook(hookId));
      expect(button.attributes('disabled'), hookId).toBeUndefined();
      await button.trigger('click');
    };
    await click('owned-build');
    view.value = { ...view.value, houses: { [assetId]: 1 } };
    await flushPromises();
    await click('owned-sell');
    view.value = { ...view.value, houses: {} };
    await flushPromises();
    await click('owned-mortgage');
    view.value = { ...view.value, mortgages: { [assetId]: { advance: 100 as Money, lapsCompleted: 0, pending: [pid('a'), pid('b')], remainingLaps: 8 } } };
    await flushPromises();
    expect(asset.find(hook('owned-mortgaged')).exists()).toBe(true);
    await click('owned-redeem');
    expect(sent).toEqual(['BuildHouse', 'SellHouse', 'Mortgage', 'Redeem'].map(type => ({ type, payload: { assetId } })));
    w.unmount();
  });

  it('uses the fallback identity for an asset without a catalog logo', () => {
    const base = playingView(['a', 'b']);
    const cell = base.board!.cells[1]!;
    const asset = { ...cell.asset!, assetId: 'synthetic' as AssetId, name: 'Example' };
    const view = { ...base, board: { ...base.board!, cells: [{ ...cell, asset }] }, owners: { [asset.assetId]: pid('a') } };
    const context = { view, me: pid('a'), now, connected: true, pending: [] };
    const w = mount(withUi(() => h(MyAssets, { context })));
    expect(w.get('.monogram').text()).toBe('Ex');
    w.unmount();
  });

  it('preserves the selected tab through updates and clears unread chat on opening Journal', async () => {
    const matchMedia = vi.spyOn(window, 'matchMedia');
    matchMedia.mockImplementation(query => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList);
    try {
      const test = game();
      const view = playingView(['a', 'b']);
      test.sockets.last().receive(welcome(view));
      const w = mountGame(test);
      await w.get(hook('game-tab-assets')).trigger('mousedown', { button: 0, ctrlKey: false });
      expect(w.get(hook('game-tab-assets')).attributes('aria-selected')).toBe('true');
      const board = w.get(hook('board')).element;
      test.sockets.last().receive(update({ ...view, revision: 10 as Revision }));
      test.sockets.last().receive({ t: 'Chat', message: { seq: 1, at: now, authorId: pid('b'), text: 'Hi' } });
      await flushPromises();
      expect(w.get(hook('game-tab-assets')).attributes('aria-selected')).toBe('true');
      expect(w.get(hook('board')).element).toBe(board);
      expect(w.find(hook('unread-chat')).exists()).toBe(true);
      await w.get(hook('game-tab-journal')).trigger('mousedown', { button: 0, ctrlKey: false });
      expect(w.find(hook('unread-chat')).exists()).toBe(false);
      w.unmount();
    } finally { matchMedia.mockRestore(); }
  });

  it('shows the top bar without room secrets and sends projected phase captions to the board', async () => {
    const test = game();
    const view = playingView(['a', 'b']);
    const socket = test.sockets.last();
    socket.receive(welcome(view));
    const w = mountGame(test);
    await flushPromises();
    expect(w.get(hook('game-top-bar')).text()).toContain('Economic Board Game');
    expect(w.get(hook('game-player-count')).text()).toBe('2 игрока');
    expect(w.get(hook('game-connection')).text()).toContain('В сети');
    expect(test.board.captions.at(-1)).toBe('Alice бросает кости');
    await w.get(hook('game-settings')).trigger('click');
    await flushPromises();
    expect(document.body.textContent).toContain('Громкость звука');
    expect(document.body.textContent).toContain('Выключить звук');

    const auctionCell = view.board!.cells.find(cell => cell.asset !== null)!;
    socket.receive(update({ ...view, revision: 11 as Revision, auction: {
      auctionId: 'auction-1', assetId: auctionCell.asset!.assetId, cell: auctionCell.index,
      price: 100 as never, startBid: 60 as never, step: 10 as never, reason: 'choice', order: view.order!,
      passed: [], leader: null, leadingBid: null, bids: [], responder: pid('a'), responseId: 'response-1', responseDeadline: 60_000 as never,
    } }));
    await flushPromises();
    expect(test.board.captions.at(-1)).toBe('Аукцион');
    expect(w.find(hook('RollDice')).exists()).toBe(false);
    expect(w.find(hook('EndTurn')).exists()).toBe(false);
    w.unmount();
  });

  it('permits returning to the lobby only after the server projects resignation', async () => {
    const test = game();
    const view = playingView(['a', 'b', 'c']);
    const socket = test.sockets.last();
    socket.receive(welcome(view));
    const w = mountGame(test);
    const leave = w.get(hook('game-leave'));
    expect(leave.attributes('disabled')).toBeDefined();
    expect(w.get(`[id="${leave.attributes('aria-describedby')}"]`).text()).toContain('сначала сдайтесь');
    await leave.trigger('click');
    expect(test.client.session.state.room).not.toBeNull();
    await w.get(hook('Resign')).trigger('click');
    await w.get(hook('confirm-resign')).trigger('click');
    const command = socket.sent.find(frame => frame.t === 'Command');
    expect(command).toMatchObject({ type: 'Resign', payload: null });
    if (!command) throw Error('Expected the Resign command');
    socket.receive({ t: 'Ack', commandId: command.commandId, outcome: 'accepted', revision: 10 as Revision });
    await flushPromises();
    expect(leave.attributes('disabled')).toBeDefined();
    socket.receive(update({ ...view, revision: 10 as Revision, order: [pid('b'), pid('c')],
      eliminated: [pid('a')], turn: { ...view.turn!, playerId: pid('b') } }));
    await flushPromises();
    expect(w.get(hook('Resign')).attributes('disabled')).toBeDefined();
    expect(leave.attributes('disabled')).toBeUndefined();
    await leave.trigger('click');
    expect(test.client.session.state.room).toBeNull();
    expect(w.attributes('data-screen')).toBe('lobby');
    w.unmount();
  });
});

describe('journal and feedback', () => {
  it('skips unknown events and preserves reader scroll position when a row arrives', async () => {
    expect(describeEvent({ type: 'FutureEvent', payload: null }, nameOf, nameOf)).toBeNull();
    const make = (seq: number): JournalItem => ({ kind: 'chat', at: seq, key: String(seq), message: { seq, at: seq, authorId: pid('a'), text: 'Hello' } });
    const w = mount(EventFeed, { props: { items: [make(1)], generation: 1, visible: true, nameOf, assetOf: nameOf } });
    const list = w.get(hook('journal-list'));
    Object.defineProperties(list.element, { scrollHeight: { value: 300 }, clientHeight: { value: 100 } });
    list.element.scrollTop = 20;
    await list.trigger('scroll');
    await w.setProps({ items: [make(1), make(2)] });
    await flushPromises();
    expect(list.element.scrollTop).toBe(20);
    list.element.scrollTop = 200;
    await list.trigger('scroll');
    await w.setProps({ items: [make(1), make(2), make(3)] });
    await flushPromises();
    expect(list.element.scrollTop).toBe(300);
    w.unmount();
  });

  it('checks code point and line limits, then shows the translated ChatAck rejection', async () => {
    const chat = createChatStore();
    const sendChat = vi.fn(() => 'id');
    const w = mount(ChatComposer, { props: { chat, transport: { sendChat }, connected: true } });
    const input = w.get(hook('chat-input'));
    const send = w.get(hook('chat-send'));
    for (const invalid of ['  ', '🙂'.repeat(301), '1\n2\n3\n4\n5']) {
      await input.setValue(invalid);
      expect(send.attributes('disabled')).toBeDefined();
      await w.get('form').trigger('submit');
    }
    expect(sendChat).not.toHaveBeenCalled();
    const valid = `🙂${'a'.repeat(293)}\n1\n2\n3`;
    await input.setValue(` ${valid} `);
    expect(send.attributes('disabled')).toBeUndefined();
    await w.get('form').trigger('submit');
    expect(sendChat).toHaveBeenCalledWith(valid);
    chat.acknowledge({ t: 'ChatAck', clientMsgId: 'id', ok: false, reason: 'TOO_FAST' });
    await flushPromises();
    expect(w.get(hook('chat-rejection')).text()).toContain('Подождите перед отправкой следующего сообщения.');
    w.unmount();
  });

  it.each(['eliminated', 'spectator'])('lets an %s room member send chat', async viewer => {
    const test = game();
    const base = playingView(['a', 'b']);
    const view = viewer === 'eliminated'
      ? { ...base, eliminated: [pid('a')] }
      : { ...base, players: base.players.filter(player => player.id !== 'a') };
    test.sockets.last().receive(welcome(view));
    const w = mountGame(test);
    await w.get(hook('chat-input')).setValue('Hello');
    await w.get(hook('chat-composer')).trigger('submit');
    expect(test.sockets.last().sent).toContainEqual({ t: 'ChatSend', clientMsgId: 'c1', text: 'Hello' });
    w.unmount();
  });

  it('shows a rejected build toast title and reason without code-equals-message leakage', async () => {
    const test = game();
    const view = playingView(['a', 'b']);
    const socket = test.sockets.last();
    socket.receive(welcome(view));
    const w = mountGame(test);
    const assetId = view.board!.cells.find(cell => cell.kind === 'monopoly')!.asset!.assetId;
    test.client.sendCommand({ type: 'BuildHouse', payload: { assetId } });
    socket.receive({ t: 'Ack', commandId: 'c1' as never, revision: view.revision, outcome: 'rejected',
      error: { code: 'BUILD_QUOTA_USED', message: 'BUILD_QUOTA_USED' } });
    await w.vm.$nextTick();

    const toast = new DOMWrapper(document.body).get('.ds-toast');
    expect(toast.get('.ds-toast-title').text()).toBe('Нельзя построить дом');
    expect(toast.get('.ds-toast-description').text()).toBe('Дом уже построен в этом ходу.');
    expect(toast.text()).not.toContain('BUILD_QUOTA_USED');
    expect(toast.attributes('data-code')).toBe('BUILD_QUOTA_USED');
    w.unmount();
  });

  it('announces reconnect until Welcome and caps translated rejections at three', async () => {
    vi.useFakeTimers();
    try {
      const test = game();
      const view = playingView(['a', 'b']);
      const first = test.sockets.last();
      first.receive(welcome(view));
      const w = mountGame(test);
      first.drop();
      await w.vm.$nextTick();
      expect(w.get(hook('offline')).attributes('role')).toBe('status');
      await vi.advanceTimersByTimeAsync(500);
      const second = test.sockets.last();
      expect(second).not.toBe(first);
      second.open();
      await w.vm.$nextTick();
      expect(w.find(hook('offline')).exists()).toBe(true);
      second.receive(welcome(view));
      await w.vm.$nextTick();
      expect(w.find(hook('offline')).exists()).toBe(false);
      for (let i = 1; i <= 4; i++) {
        test.client.sendCommand('RollDice');
        second.receive({ t: 'Ack', commandId: `c${i}` as never, revision: view.revision,
          outcome: 'rejected', error: { code: 'DEADLINE_PASSED', message: `reason ${i}` } });
      }
      await w.vm.$nextTick();
      const toasts = new DOMWrapper(document.body).findAll(hook('message'));
      expect(toasts.map(toast => toast.text())).toHaveLength(3);
      expect(toasts.map(toast => toast.text())).toEqual(Array(3).fill('Нельзя бросить костиВремя хода вышло.×'));
      expect(toasts[0]!.get('.ds-toast-title').text()).toBe('Нельзя бросить кости');
      expect(toasts[0]!.get('.ds-toast-description').text()).toBe('Время хода вышло.');
      expect(toasts.every(toast => !toast.text().includes('reason '))).toBe(true);
      expect(toasts[0]!.text()).toContain('Время хода вышло');
      await toasts[0]!.get(hook('message-dismiss')).trigger('click');
      expect(new DOMWrapper(document.body).findAll(hook('message'))).toHaveLength(2);
      w.unmount();
    } finally { vi.useRealTimers(); }
  });
});
