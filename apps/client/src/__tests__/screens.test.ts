import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../App.vue';
import { BOARD_MOUNT_KEY, CLIENT_KEY } from '../client';
import LobbyScreen from '../screens/LobbyScreen.vue';
import LoginScreen from '../screens/LoginScreen.vue';
import RoomScreen from '../screens/RoomScreen.vue';
import {
  GUEST,
  harness,
  lobbyView,
  playingView,
  room,
  setupView,
  storedSession,
  update,
  welcome,
  type Harness,
  type Route,
} from './helpers';

const provide = (h: Harness) => ({ global: { provide: { [CLIENT_KEY as symbol]: h.client, [BOARD_MOUNT_KEY as symbol]: h.mount } } });
const ALICE_ROOM = room([['a', 'Alice']]);
const BOB_ROOM = room([['b', 'Bob']], 'b', 'r2');

afterEach(() => vi.restoreAllMocks());

describe('LoginScreen', () => {
  const login: Route = (call) => (call.path === '/api/guests' ? { body: { guestId: 'g1', token: 'tok-1' } } : { body: { rooms: [] } });

  it('sends the trimmed nickname, stores the guest and leaves the login screen', async () => {
    const h = harness({ route: login });
    const wrapper = mount(App, provide(h));
    expect(wrapper.attributes('data-screen')).toBe('login');
    await wrapper.find('input').setValue(' bob ');
    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(h.calls[0]).toMatchObject({ method: 'POST', path: '/api/guests', body: { nickname: 'bob' } });
    expect(JSON.parse(h.storage.getItem('game.guest')!)).toEqual({ guestId: 'g1', token: 'tok-1', nickname: 'bob' });
    expect(wrapper.attributes('data-screen')).toBe('lobby');
  });

  it.each(['', '   ', 'x'.repeat(25)])('does not send the invalid nickname %j', async (value) => {
    const h = harness({ route: login });
    const wrapper = mount(LoginScreen, provide(h));
    await wrapper.find('input').setValue(value);
    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(h.calls).toEqual([]);
    expect(wrapper.find('[data-test="invalid"]').exists()).toBe(true);
    expect(h.client.session.state.guest).toBeNull();
  });

  it('shows a failed login and stays on the login screen', async () => {
    const h = harness({ route: () => ({ status: 400, body: { code: 'INVALID_REQUEST', message: 'Nickname rejected' } }) });
    const wrapper = mount(App, provide(h));
    await wrapper.find('input').setValue('bob');
    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(wrapper.find('[data-test="error"]').text()).toContain('Nickname rejected');
    expect(wrapper.attributes('data-screen')).toBe('login');
    expect(h.storage.data.size).toBe(0);
  });
});

describe('LobbyScreen', () => {
  const lobby: Route = (call) => {
    if (call.method === 'GET') return { body: { rooms: [BOB_ROOM] } };
    if (call.path === '/api/rooms') return { body: { room: ALICE_ROOM } };
    if (call.path === '/api/rooms/r2/join') return { body: { room: { ...BOB_ROOM, members: [...BOB_ROOM.members, { guestId: 'a', nickname: 'Alice' }] } } };
    return undefined;
  };

  it('reload in the lobby: shows the lobby without a new guest login', async () => {
    const h = harness({ stored: storedSession(), route: lobby });
    const wrapper = mount(App, provide(h));
    await flushPromises();
    expect(wrapper.attributes('data-screen')).toBe('lobby');
    expect(h.calls.some((c) => c.path === '/api/guests')).toBe(false);
    expect(h.calls[0]).toMatchObject({ method: 'GET', path: '/api/rooms', headers: { authorization: `Bearer ${GUEST.token}` } });
  });

  it('lists joinable rooms with their members and offers no leave control', async () => {
    const h = harness({ stored: storedSession(), route: lobby });
    const wrapper = mount(LobbyScreen, provide(h));
    await flushPromises();
    expect(wrapper.findAll('[data-test="room"]')).toHaveLength(1);
    expect(wrapper.find('[data-test="room-members"]').text()).toBe('Bob');
    expect(wrapper.text()).not.toMatch(/leave/i);
  });

  it('create: requests a room, shows the room view and connects to it', async () => {
    const h = harness({ stored: storedSession(), route: lobby });
    const wrapper = mount(App, provide(h));
    await flushPromises();
    await wrapper.find('[data-test="create"]').trigger('click');
    await flushPromises();
    expect(h.calls.map((c) => `${c.method} ${c.path}`)).toContain('POST /api/rooms');
    expect(wrapper.attributes('data-screen')).toBe('room');
    expect(h.client.session.state.room?.roomId).toBe('r1');
    h.sockets.last().open();
    expect(h.sockets.last().sent[0]).toMatchObject({ t: 'Hello', gameId: 'r1', lastRevision: null });
  });

  it('join: requests join for that room id and shows the room view', async () => {
    const h = harness({ stored: storedSession(), route: lobby });
    const wrapper = mount(App, provide(h));
    await flushPromises();
    await wrapper.find('[data-test="join"]').trigger('click');
    await flushPromises();
    expect(h.calls.map((c) => `${c.method} ${c.path}`)).toContain('POST /api/rooms/r2/join');
    expect(wrapper.attributes('data-screen')).toBe('room');
    expect(JSON.parse(h.storage.getItem('game.room')!).roomId).toBe('r2');
  });

  it('malformed response: shows an error and renders nothing from it', async () => {
    const h = harness({ stored: storedSession(), route: () => ({ body: { rooms: [{ roomId: 'r9', members: 'x' }] } }) });
    const wrapper = mount(LobbyScreen, provide(h));
    await flushPromises();
    expect(wrapper.find('[data-test="error"]').text()).toContain('BAD_RESPONSE');
    expect(wrapper.findAll('[data-test="room"]')).toHaveLength(0);
    expect(wrapper.text()).not.toContain('r9');
  });

  it('token rejected: clears the stored guest and shows the login screen', async () => {
    const h = harness({ stored: storedSession(), route: () => ({ status: 401, body: { code: 'UNAUTHENTICATED', message: 'Unknown token' } }) });
    const wrapper = mount(App, provide(h));
    await flushPromises();
    expect(wrapper.attributes('data-screen')).toBe('login');
    expect(h.storage.data.size).toBe(0);
  });
});

describe('RoomScreen', () => {
  const start = (wrapper: ReturnType<typeof mount>) => wrapper.find('[data-test="start"]');
  const names = (wrapper: ReturnType<typeof mount>): string[] =>
    wrapper.findAll('[data-test="member"]').map((m) => m.text().split(/\s+/)[0]!);

  function inRoom(summary = ALICE_ROOM, route?: Route): Harness {
    const h = harness({ stored: storedSession(summary), ...(route !== undefined && { route }) });
    h.client.start();
    h.sockets.last().open();
    return h;
  }

  it('creator alone: Start is visible and disabled', async () => {
    const h = inRoom();
    const wrapper = mount(RoomScreen, provide(h));
    h.sockets.last().receive(welcome(lobbyView(['a'])));
    await flushPromises();
    expect(names(wrapper)).toEqual(['Alice']);
    expect(start(wrapper).exists()).toBe(true);
    expect(start(wrapper).attributes('disabled')).toBeDefined();
    expect(wrapper.text()).not.toMatch(/leave/i);
  });

  it('a second member arrives on the socket: Start becomes enabled and the nickname is looked up once', async () => {
    const withBob = room([['a', 'Alice'], ['b', 'Bob']]);
    const h = inRoom(ALICE_ROOM, () => ({ body: { rooms: [withBob] } }));
    const wrapper = mount(RoomScreen, provide(h));
    h.sockets.last().receive(welcome(lobbyView(['a'], 2)));
    h.sockets.last().receive(update(lobbyView(['a', 'b'], 3), [{ type: 'PlayerAdded', payload: { playerId: 'b' } }]));
    await flushPromises();
    expect(names(wrapper)).toEqual(['Alice', 'Bob']);
    expect(start(wrapper).attributes('disabled')).toBeUndefined();
    h.sockets.last().receive(update(lobbyView(['a', 'b'], 4)));
    await flushPromises();
    expect(h.calls.filter((c) => c.method === 'GET')).toHaveLength(1);
  });

  it('falls back to the player id when no nickname is known', async () => {
    const h = inRoom();
    const wrapper = mount(RoomScreen, provide(h));
    h.sockets.last().receive(welcome(lobbyView(['a', 'zz'])));
    await flushPromises();
    expect(names(wrapper)).toEqual(['Alice', 'zz']);
  });

  it('a non-creator sees no Start button', async () => {
    const h = inRoom(room([['b', 'Bob'], ['a', 'Alice']], 'b'));
    const wrapper = mount(RoomScreen, provide(h));
    h.sockets.last().receive(welcome(lobbyView(['b', 'a'])));
    await flushPromises();
    expect(start(wrapper).exists()).toBe(false);
    expect(wrapper.find('[data-test="waiting"]').exists()).toBe(true);
  });

  it('Start requests the start route; a rejection is shown', async () => {
    const h = inRoom(room([['a', 'Alice'], ['b', 'Bob']]), () => ({ status: 409, body: { code: 'NOT_ENOUGH_PLAYERS', message: 'Need two' } }));
    const wrapper = mount(RoomScreen, provide(h));
    h.sockets.last().receive(welcome(lobbyView(['a', 'b'])));
    await flushPromises();
    await start(wrapper).trigger('click');
    await flushPromises();
    expect(h.calls[h.calls.length - 1]).toMatchObject({ method: 'POST', path: '/api/rooms/r1/start' });
    expect(wrapper.find('[data-test="error"]').text()).toContain('NOT_ENOUGH_PLAYERS');
  });
});

describe('App screen selection', () => {
  const TWO = room([['a', 'Alice'], ['b', 'Bob']]);

  it('phase lobby shows the room view; leaving lobby shows the game screen for every member', async () => {
    const h = harness({ stored: storedSession(TWO) });
    h.client.start();
    const wrapper = mount(App, provide(h));
    expect(wrapper.attributes('data-screen')).toBe('room');
    h.sockets.last().open();
    h.sockets.last().receive(welcome(lobbyView(['a', 'b'], 3), 'b'));
    await flushPromises();
    expect(wrapper.attributes('data-screen')).toBe('room');

    h.sockets.last().receive(update(setupView(['a', 'b'], { revision: 4, roller: 'a', deadline: 95_000 })));
    await flushPromises();
    expect(wrapper.attributes('data-screen')).toBe('game');
    expect(wrapper.find('[data-test="timer"]').text()).toBe('45 s');
    expect(wrapper.find('[data-test="headline"]').text()).toBe('Rolling for turn order: Alice');
    expect(h.board.snaps.length).toBeGreaterThan(0);
  });

  it('a reload mid-game goes straight to the game screen with cached names', async () => {
    const h = harness({ stored: storedSession(TWO) });
    h.client.start();
    const wrapper = mount(App, provide(h));
    h.sockets.last().open();
    h.sockets.last().receive(welcome(playingView(['b', 'a'], { owner: 'a', deadline: 62_400 })));
    await flushPromises();
    expect(wrapper.attributes('data-screen')).toBe('game');
    expect(wrapper.findAll('[data-test="order-name"]').map((n) => n.text())).toEqual(['Bob', 'Alice']);
    expect(wrapper.find('[data-test="timer"]').text()).toBe('13 s');
  });

  it('pressing Roll sends one command and disables the button until the Ack', async () => {
    const h = harness({ stored: storedSession(TWO) });
    h.client.start();
    const wrapper = mount(App, provide(h));
    h.sockets.last().open();
    h.sockets.last().receive(welcome(playingView(['a', 'b'], { owner: 'a' })));
    await flushPromises();
    const roll = wrapper.find('[data-test="RollDice"]');
    await roll.trigger('click');
    expect(roll.attributes('disabled')).toBeDefined();
    await roll.trigger('click');
    expect(h.sockets.last().sent.filter((f) => f.t === 'Command')).toHaveLength(1);

    h.sockets.last().receive({ t: 'Ack', commandId: 'c1', outcome: 'rejected', revision: 9, error: { code: 'DEADLINE_PASSED', message: 'Too late' } } as never);
    await flushPromises();
    expect(wrapper.find('[data-test="message"]').text()).toContain('DEADLINE_PASSED');
    expect(roll.attributes('disabled')).toBeUndefined();
  });

  it('room gone: the stored room is cleared and the lobby is shown', async () => {
    const h = harness({ stored: storedSession(TWO) });
    h.client.start();
    const wrapper = mount(App, provide(h));
    h.sockets.last().open();
    h.sockets.last().receive({ t: 'Error', code: 'ROOM_UNAVAILABLE', message: 'No such room' });
    await flushPromises();
    expect(wrapper.attributes('data-screen')).toBe('lobby');
    expect(h.storage.getItem('game.room')).toBeNull();
    expect(wrapper.find('[data-test="notice"]').text()).toContain('ROOM_UNAVAILABLE');
  });
});
