import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { Text } from 'pixi.js';
import { generateBoard, seedRng } from '@game/game-core';
import PlayerPanel from '../components/PlayerPanel.vue';
import AssetCard from '../components/AssetCard.vue';
import GameScreen from '../screens/GameScreen.vue';
import { BoardScene } from '../board/BoardCanvas';
import { cellDisplay, GROUP_COLORS } from '../board/display';
import { BOARD_MOUNT_KEY, CLIENT_KEY } from '../client';
import { harness, playingView, pid, storedSession, room, welcome, update } from './helpers';

const board = generateBoard(seedRng(42)).board;
describe('stage 2 display', () => {
  it('maps every projected cell and distinguishes all ten groups', () => {
    expect(new Set(Object.values(GROUP_COLORS)).size).toBe(10);
    for (const cell of board.cells) {
      const display = cellDisplay(cell);
      if (cell.asset) expect(display).toEqual({ name: cell.asset.name, group: cell.asset.groupId, price: String(cell.asset.price), color: GROUP_COLORS[cell.asset.groupId] });
      else expect(display).toEqual({ name: { start: 'Start', jail: 'Jail', casino: 'Casino', 'go-to-jail': 'Go to jail', chance: 'Chance' }[cell.kind as 'start'], group: null, color: null, price: null });
    }
  });
  it('draws projected labels and only selects assets', () => {
    const scene = new BoardScene(); scene.snap(playingView(['a', 'b']), 'a');
    const select = vi.fn(); scene.setAssetSelection(select);
    for (const cell of board.cells) {
      const box = scene.cells.children[cell.index]!;
      const texts = box.children.filter(c => c instanceof Text).map(c => (c as Text).text);
      if (cell.asset) {
        expect(texts).toContain(String(cell.asset.price)); expect(texts).toContain(cell.asset.groupId);
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
    expect(panel.findAll('li')).toHaveLength(3);
    await panel.setProps({ view: { ...view, balances: { a: 12340 as never, b: 45670 as never, c: 890 as never }, eliminated: [pid('b')], order: [pid('a'), pid('c')] }, nameOf: id => `New ${id}` });
    expect(panel.findAll('li').map(x => x.text())).toEqual(['New a12340Active turn', 'New b45670Out', 'New c890']);
    panel.unmount();
  });
  it.each(['M1', 'logistics', 'energy'])('shows projected %s details and group peers', group => {
    const cell = board.cells.find(c => c.asset?.groupId === group)!;
    const card = mount(AssetCard, { props: { cell, board } });
    expect(card.text()).toContain(cell.asset!.name); expect(card.text()).toContain(cell.asset!.categoryName);
    expect(card.text()).toContain(String(cell.asset!.price));
    expect(card.text().includes('Rank')).toBe(cell.asset!.rank !== null);
    const peers = board.cells.filter(c => c.index !== cell.index && c.asset?.groupId === group);
    expect(card.findAll('li')).toHaveLength(peers.length);
    peers.forEach(c => { expect(card.text()).toContain(c.asset!.name); expect(card.text()).toContain(`cell ${c.index}`); expect(card.text()).toContain(String(c.asset!.price)); });
    card.unmount();
  });
  it('shows an Update balance while movement animation is still pending', async () => {
    const h = harness({ stored: storedSession(room([['a', 'Alice'], ['b', 'Bob']])) });
    h.client.start(); h.sockets.last().open();
    const view = playingView(['a', 'b']); h.sockets.last().receive(welcome(view));
    let finish!: () => void;
    h.board.play = () => new Promise<void>(resolve => { finish = resolve; });
    const wrapper = mount(GameScreen, { global: { provide: { [CLIENT_KEY as symbol]: h.client, [BOARD_MOUNT_KEY as symbol]: h.mount } } });
    await flushPromises();
    h.sockets.last().receive(update({ ...view, revision: 10 as never, balances: { ...view.balances, a: 98760 as never } }, [
      { type: 'PlayerMoved', payload: { playerId: 'a', from: 39, to: 0, steps: 1 } },
      { type: 'BalanceChanged', payload: { playerId: 'a', balance: 98760, delta: 100, reason: 'lap-reward' } },
    ]));
    await flushPromises();
    expect(wrapper.find('[data-test="player-balance"]').text()).toContain('98760');
    expect(finish).toBeTypeOf('function'); finish(); await flushPromises();
    wrapper.unmount(); h.client.returnToLobby();
  });
  it('wires selection, dismisses on close/Escape/replacement and clears callback on unmount', async () => {
    const h = harness({ stored: storedSession(room([['a', 'Alice'], ['b', 'Bob']])) });
    h.client.start(); h.sockets.last().open(); h.sockets.last().receive(welcome(playingView(['a', 'b'])));
    let select: ((index: number) => void) | null = null;
    h.board.setAssetSelection = cb => { select = cb; };
    const wrapper = mount(GameScreen, { global: { provide: { [CLIENT_KEY as symbol]: h.client, [BOARD_MOUNT_KEY as symbol]: h.mount } } });
    await flushPromises();
    const click = async (index: number) => { (select as ((index: number) => void) | null)?.(index); await flushPromises(); };
    await click(0); expect(wrapper.find('[data-test="asset-card"]').exists()).toBe(false);
    await click(1); expect(wrapper.find('[data-test="asset-card"]').exists()).toBe(true);
    await wrapper.find('[aria-label="Close asset card"]').trigger('click'); expect(wrapper.find('[data-test="asset-card"]').exists()).toBe(false);
    await click(1); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); await flushPromises(); expect(wrapper.find('[data-test="asset-card"]').exists()).toBe(false);
    await click(1);
    h.sockets.last().receive(update({ ...playingView(['a', 'b']), revision: 10 as never, balances: { a: 98760 as never, b: 120 as never } }));
    await flushPromises(); expect(wrapper.find('[data-test="asset-card"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="player-balance"]').text()).toContain('98760');
    h.client.game.view = { ...h.client.game.view!, board: generateBoard(seedRng(43)).board }; await flushPromises(); expect(wrapper.find('[data-test="asset-card"]').exists()).toBe(false);
    wrapper.unmount(); expect(select).toBeNull(); h.client.returnToLobby();
  });
});
