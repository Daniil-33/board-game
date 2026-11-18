import { h as render } from 'vue';
import { withUi } from './helpers';
const money = (value: number): string => String(value).replace(/\B(?=(\d{3})+(?!\d))/g, '\u202F');
import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { Text } from 'pixi.js';
import { generateBoard, seedRng } from '@game/game-core';
import { PlayerPanel } from '../widgets/players-panel/index';
import { AssetCard } from '../widgets/asset-card/index';
import { GameScreen } from '../pages/game/index';
import { BoardScene } from '../widgets/board/index';
import { cellDisplay } from '../widgets/board/index';
import { BOARD_MOUNT_KEY, CLIENT_KEY } from '../features/client-session/index';
import { harness, playingView, pid, storedSession, room, welcome, update } from './helpers';

const board = generateBoard(seedRng(42)).board;
describe('stage 2 display', () => {
  it('maps every projected cell and distinguishes all ten groups', () => {
    const groups = new Set(board.cells.flatMap(cell => cell.asset ? [cell.asset.groupId] : []));
    const { theme } = new BoardScene();
    expect(new Set([...groups].map(group => theme.group(group).join())).size).toBe(10);
    for (const cell of board.cells) {
      const display = cellDisplay(cell);
      if (cell.asset) expect(display).toEqual({ name: cell.asset.name, group: cell.asset.groupId, price: money(cell.asset.price) });
      else expect(display).toEqual({ name: { start: 'Старт', jail: 'Тюрьма', casino: 'Казино', 'go-to-jail': 'В тюрьму', chance: 'Шанс' }[cell.kind as 'start'], group: null, price: null });
    }
  });
  it('draws projected labels and only selects assets', () => {
    const scene = new BoardScene(); scene.snap(playingView(['a', 'b']), 'a');
    const select = vi.fn(); scene.setAssetSelection(select);
    for (const cell of board.cells) {
      const box = scene.cells.children[cell.index]!;
      const texts = box.children.filter(c => c instanceof Text).map(c => (c as Text).text);
      if (cell.asset) {
        expect(texts).toContain(money(cell.asset.price));
        box.emit('pointertap', {} as never); expect(select).toHaveBeenLastCalledWith(cell.index);
      } else { select.mockClear(); box.emit('pointertap', {} as never); expect(select).not.toHaveBeenCalled(); }
    }
    const firstCell = scene.cells.children[1];
    scene.snap({ ...playingView(['a', 'b']), board: JSON.parse(JSON.stringify(board)) }, 'a');
    expect(scene.cells.children[1]).toBe(firstCell);
    scene.snap({ ...playingView(['a', 'b']), board: generateBoard(seedRng(43)).board }, 'a');
    expect(scene.cells.children[1]).not.toBe(firstCell);
    scene.setAssetSelection(null); select.mockClear(); scene.cells.children[1]!.emit('pointertap', {} as never); expect(select).not.toHaveBeenCalled();
  });
  it('refreshes balances, names and active/out marks for every participant', async () => {
    const view = playingView(['a', 'b', 'c']);
    const panel = mount(PlayerPanel, { props: { view, nameOf: id => id } });
    expect(panel.findAll('[data-testid="player-balance"]')).toHaveLength(3);
    await panel.setProps({ view: { ...view, balances: { a: 12340 as never, b: 45670 as never, c: 890 as never }, eliminated: [pid('b')], order: [pid('a'), pid('c')] }, nameOf: id => `New ${id}` });
    expect(panel.findAll('[data-testid="player-balance-name"]').map(x => x.text())).toEqual(['New a', 'New b', 'New c']);
    expect(panel.findAll('[data-testid="player-balance-value"]').map(x => x.text())).toEqual(['12\u202F340', '45\u202F670', '890']);
    expect(panel.get('[data-player-id="a"] [data-testid="player-active"]').text()).toBe('Ходит');
    expect(panel.get('[data-player-id="b"] [data-testid="player-eliminated"]').text()).toBe('Выбыл');
    panel.unmount();
  });
  it.each(['M1', 'logistics', 'energy'])('shows projected %s details and group peers', group => {
    const cell = board.cells.find(c => c.asset?.groupId === group)!;
    const card = mount(AssetCard, { props: { cell, board } });
    expect(card.text()).toContain(cell.asset!.name); expect(card.text()).toContain(cell.asset!.categoryName);
    expect(card.text()).toContain(money(cell.asset!.price));
    expect(card.text().includes('Ранг')).toBe(cell.asset!.rank !== null);
    const peers = board.cells.filter(c => c.index !== cell.index && c.asset?.groupId === group);
    expect(card.findAll('[data-testid="asset-group-member"]')).toHaveLength(peers.length);
    peers.forEach(c => { expect(card.text()).toContain(c.asset!.name); expect(card.text()).toContain(`клетка ${c.index}`); expect(card.text()).toContain(money(c.asset!.price)); });
    card.unmount();
  });
  it('shows an Update balance while movement animation is still pending', async () => {
    const h = harness({ stored: storedSession(room([['a', 'Alice'], ['b', 'Bob']])) });
    h.client.start(); h.sockets.last().open();
    const view = playingView(['a', 'b']); h.sockets.last().receive(welcome(view));
    let finish!: () => void;
    h.board.play = () => new Promise<void>(resolve => { finish = resolve; });
    const wrapper = mount(withUi(() => render(GameScreen)), { global: { provide: { [CLIENT_KEY as symbol]: h.client, [BOARD_MOUNT_KEY as symbol]: h.mount } } });
    await flushPromises();
    h.sockets.last().receive(update({ ...view, revision: 10 as never, balances: { ...view.balances, a: 98760 as never } }, [
      { type: 'PlayerMoved', payload: { playerId: 'a', from: 39, to: 0, steps: 1 } },
      { type: 'BalanceChanged', payload: { playerId: 'a', balance: 98760, delta: 100, reason: 'lap-reward' } },
    ]));
    await flushPromises();
    expect(wrapper.find('[data-testid="player-balance"]').text()).toContain('98\u202F760');
    expect(finish).toBeTypeOf('function'); finish(); await flushPromises();
    wrapper.unmount(); h.client.returnToLobby();
  });
  it('wires selection, dismisses on close/Escape/replacement and clears callback on unmount', async () => {
    const h = harness({ stored: storedSession(room([['a', 'Alice'], ['b', 'Bob']])) });
    h.client.start(); h.sockets.last().open(); h.sockets.last().receive(welcome(playingView(['a', 'b'])));
    let select: ((index: number) => void) | null = null;
    h.board.setAssetSelection = cb => { select = cb; };
    const wrapper = mount(withUi(() => render(GameScreen)), { global: { provide: { [CLIENT_KEY as symbol]: h.client, [BOARD_MOUNT_KEY as symbol]: h.mount } } });
    await flushPromises();
    const click = async (index: number) => { (select as ((index: number) => void) | null)?.(index); await flushPromises(); };
    await click(0); expect(wrapper.find('[data-testid="asset-card"]').exists()).toBe(false);
    await click(1); expect(wrapper.find('[data-testid="asset-card"]').exists()).toBe(true);
    await wrapper.find('[data-testid="asset-close"]').trigger('click'); expect(wrapper.find('[data-testid="asset-card"]').exists()).toBe(false);
    await click(1); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); await flushPromises(); expect(wrapper.find('[data-testid="asset-card"]').exists()).toBe(false);
    await click(1);
    h.sockets.last().receive(update({ ...playingView(['a', 'b']), revision: 10 as never, balances: { a: 98760 as never, b: 120 as never }, owners: { [board.cells[1]!.asset!.assetId]: pid('b') } }));
    await flushPromises(); expect(wrapper.find('[data-testid="asset-card"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="player-balance"]').text()).toContain('98\u202F760');
    expect(wrapper.get('[data-testid="asset-owner"]').text()).toBe('Bob');
    h.client.game.view = { ...h.client.game.view!, board: generateBoard(seedRng(43)).board }; await flushPromises(); expect(wrapper.find('[data-testid="asset-card"]').exists()).toBe(false);
    wrapper.unmount(); expect(select).toBeNull(); h.client.returnToLobby();
  });
});
