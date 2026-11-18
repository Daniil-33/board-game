import { DOMWrapper, enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../app/index';
import { BOARD_MOUNT_KEY, CLIENT_KEY } from '../features/client-session/index';
import { LobbyScreen } from '../pages/lobby/index';
import { LoginScreen } from '../pages/login/index';
import { RoomScreen } from '../pages/room/index';
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

enableAutoUnmount(afterEach);
const body = new DOMWrapper(document.body);

const provide = (h: Harness) => ({ global: { provide: { [CLIENT_KEY as symbol]: h.client, [BOARD_MOUNT_KEY as symbol]: h.mount } } });
const pageOptions = (h: Harness) => ({
  global: { ...provide(h).global, stubs: { Tooltip: { template: '<slot />' } } },
});
const ALICE_ROOM = room([['a', 'Alice']]);
const BOB_ROOM = room([['b', 'Bob']], 'b', 'r2');

afterEach(() => vi.restoreAllMocks());

describe('LoginScreen', () => {
  const login: Route = (call) => (call.path === '/api/guests' ? { body: { guestId: 'g1', token: 'tok-1' } } : { body: { rooms: [] } });

  it('sends the trimmed nickname, stores the guest and leaves the login screen', async () => {
    const h = harness({ route: login });
    const wrapper = mount(App, provide(h));
    expect(wrapper.attributes('data-screen')).toBe('login');
    await wrapper.find('[data-testid="nickname"]').setValue(' bob ');
    await wrapper.find('[data-testid="login-form"]').trigger('submit');
    await flushPromises();
    expect(h.calls[0]).toMatchObject({ method: 'POST', path: '/api/guests', body: { nickname: 'bob' } });
    expect(JSON.parse(h.storage.getItem('game.guest')!)).toEqual({ guestId: 'g1', token: 'tok-1', nickname: 'bob' });
    expect(wrapper.attributes('data-screen')).toBe('lobby');
  });

  it.each(['', '   ', 'x'.repeat(25)])('does not send the invalid nickname %j', async (value) => {
    const h = harness({ route: login });
    const wrapper = mount(LoginScreen, provide(h));
    await wrapper.find('[data-testid="nickname"]').setValue(value);
    await wrapper.find('[data-testid="login-form"]').trigger('submit');
    await flushPromises();
    expect(h.calls).toEqual([]);
    expect(wrapper.find('[data-testid="invalid"]').exists()).toBe(true);
    expect(h.client.session.state.guest).toBeNull();
  });

  it('shows a failed login and stays on the login screen', async () => {
    const h = harness({ route: () => ({ status: 400, body: { code: 'INVALID_REQUEST', message: 'Nickname rejected' } }) });
    const wrapper = mount(App, provide(h));
    await wrapper.find('[data-testid="nickname"]').setValue('bob');
    await wrapper.find('[data-testid="login-form"]').trigger('submit');
    await flushPromises();
    expect(wrapper.find('[data-testid="error"]').text()).toContain('Nickname rejected');
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
    const wrapper = mount(LobbyScreen, pageOptions(h));
    await flushPromises();
    expect(wrapper.findAll('[data-testid="room"]')).toHaveLength(1);
    expect(wrapper.find('[data-testid="room-members"]').text()).toBe('Bob');
    expect(wrapper.text()).not.toMatch(/leave/i);
  });

  it('create: requests a room, shows the room view and connects to it', async () => {
    const h = harness({ stored: storedSession(), route: lobby });
    const wrapper = mount(App, provide(h));
    await flushPromises();
    await wrapper.get('[data-testid="open-create"]').trigger('click');
    await body.get('[role=dialog] form').trigger('submit');
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
    await wrapper.find('[data-testid="join"]').trigger('click');
    await flushPromises();
    expect(h.calls.map((c) => `${c.method} ${c.path}`)).toContain('POST /api/rooms/r2/join');
    expect(wrapper.attributes('data-screen')).toBe('room');
    expect(JSON.parse(h.storage.getItem('game.room')!).roomId).toBe('r2');
  });

  it('a background poll keeps a shown error and does not block the buttons', async () => {
    vi.useFakeTimers();
    try {
      const h = harness({
        stored: storedSession(),
        route: (call) => (call.method === 'GET' ? { body: { rooms: [BOB_ROOM] } } : { status: 409, body: { code: 'ROOM_UNAVAILABLE', message: 'Gone' } }),
      });
      const wrapper = mount(LobbyScreen, pageOptions(h));
      await flushPromises();
      await wrapper.find('[data-testid="join"]').trigger('click');
      await flushPromises();
      expect(wrapper.find('[data-testid="error"]').text()).toContain('ROOM_UNAVAILABLE');

      const polls = h.calls.filter((c) => c.method === 'GET').length;
      // The poll has been sent and not answered yet.
      vi.advanceTimersByTime(5000);
      await wrapper.vm.$nextTick();
      expect(h.calls.filter((c) => c.method === 'GET').length).toBe(polls + 1);
      expect(h.client.lobby.busy).toBe(false);
      for (const button of ['open-create', 'join', 'refresh']) {
        expect(wrapper.find(`[data-testid="${button}"]`).attributes('disabled')).toBeUndefined();
      }
      expect(wrapper.find('[data-testid="error"]').text()).toContain('ROOM_UNAVAILABLE');
      // And after it was answered.
      await flushPromises();
      expect(wrapper.find('[data-testid="error"]').text()).toContain('ROOM_UNAVAILABLE');
      expect(wrapper.findAll('[data-testid="room"]')).toHaveLength(1);
      wrapper.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it('malformed response: shows an error and renders nothing from it', async () => {
    const h = harness({ stored: storedSession(), route: () => ({ body: { rooms: [{ roomId: 'r9', members: 'x' }] } }) });
    const wrapper = mount(LobbyScreen, pageOptions(h));
    await flushPromises();
    expect(wrapper.find('[data-testid="error"]').text()).toContain('BAD_RESPONSE');
    expect(wrapper.findAll('[data-testid="room"]')).toHaveLength(0);
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
  const start = (wrapper: ReturnType<typeof mount>) => wrapper.find('[data-testid="start"]');
  const names = (wrapper: ReturnType<typeof mount>): string[] =>
    wrapper.findAll('[data-testid="member"]').map((m) => m.get('strong').text());

  function inRoom(summary = ALICE_ROOM, route?: Route): Harness {
    const h = harness({ stored: storedSession(summary), ...(route !== undefined && { route }) });
    h.client.start();
    h.sockets.last().open();
    return h;
  }

  it('creator alone: Start is visible and disabled', async () => {
    const h = inRoom();
    const wrapper = mount(RoomScreen, pageOptions(h));
    h.sockets.last().receive(welcome(lobbyView(['a'])));
    await flushPromises();
    expect(names(wrapper)).toEqual(['Alice']);
    expect(wrapper.findAll('[data-testid="empty-seat"]')).toHaveLength(5);
    expect(wrapper.text()).toContain('Ждём второго игрока.');
    expect(start(wrapper).exists()).toBe(true);
    expect(start(wrapper).attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-testid="leave"]').exists()).toBe(true);
  });

  it('a second member arrives on the socket: Start becomes enabled and the roster is refreshed through get-room', async () => {
    const withBob = room([['a', 'Alice'], ['b', 'Bob']]);
    const h = inRoom(ALICE_ROOM, () => ({ body: { room: withBob } }));
    const wrapper = mount(RoomScreen, pageOptions(h));
    h.sockets.last().receive(welcome(lobbyView(['a'], 2)));
    h.sockets.last().receive(update(lobbyView(['a', 'b'], 3), [{ type: 'PlayerAdded', payload: { playerId: 'b' } }]));
    await flushPromises();
    expect(names(wrapper)).toEqual(['Alice', 'Bob']);
    expect(start(wrapper).attributes('disabled')).toBeUndefined();
    h.sockets.last().receive(update(lobbyView(['a', 'b'], 4)));
    await flushPromises();
    expect(h.calls.filter((c) => c.method === 'GET').map((c) => c.path)).toEqual(['/api/rooms/r1', '/api/rooms/r1']);
  });

  it('shows a server error and a malformed-frame problem while in the room view', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const h = inRoom();
    const wrapper = mount(RoomScreen, pageOptions(h));
    h.sockets.last().receive(welcome(lobbyView(['a'])));
    h.sockets.last().receive({ t: 'Error', code: 'MALFORMED_FRAME', message: 'bad hello' });
    h.sockets.last().receive('garbage');
    await flushPromises();
    expect(wrapper.find('[data-testid="message"]').text()).toContain('MALFORMED_FRAME');
    expect(wrapper.find('[data-testid="message"]').text()).toContain('bad hello');
    expect(wrapper.find('[data-testid="problem"]').text()).toContain('Не удалось прочитать');
    await wrapper.find('[data-testid="message-dismiss"]').trigger('click');
    expect(wrapper.find('[data-testid="message"]').exists()).toBe(false);
  });

  it('falls back to the player id when no nickname is known', async () => {
    const h = inRoom();
    const wrapper = mount(RoomScreen, pageOptions(h));
    h.sockets.last().receive(welcome(lobbyView(['a', 'zz'])));
    await flushPromises();
    expect(names(wrapper)).toEqual(['Alice', 'zz']);
  });

  it('a non-creator sees no Start button', async () => {
    const h = inRoom(room([['b', 'Bob'], ['a', 'Alice']], 'b'));
    const wrapper = mount(RoomScreen, pageOptions(h));
    h.sockets.last().receive(welcome(lobbyView(['b', 'a'])));
    await flushPromises();
    expect(start(wrapper).exists()).toBe(false);
    expect(wrapper.find('[data-testid="waiting"]').exists()).toBe(true);
  });

  it('Start requests the start route; a rejection is shown', async () => {
    const h = inRoom(room([['a', 'Alice'], ['b', 'Bob']]), () => ({ status: 409, body: { code: 'NOT_ENOUGH_PLAYERS', message: 'Need two' } }));
    const wrapper = mount(RoomScreen, pageOptions(h));
    h.sockets.last().receive(welcome(lobbyView(['a', 'b'])));
    await flushPromises();
    await start(wrapper).trigger('click');
    await flushPromises();
    expect(h.calls[h.calls.length - 1]).toMatchObject({ method: 'POST', path: '/api/rooms/r1/start' });
    expect(wrapper.find('[data-testid="error"]').text()).toContain('NOT_ENOUGH_PLAYERS');
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
    expect(body.get('[data-testid="timer"]').text()).toBe('45 с');
    expect(body.get('[data-testid="headline"]').text()).toBe('Розыгрыш порядка ходов: Alice');
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
    expect(wrapper.findAll('[data-testid="order-name"]').map((n) => n.text())).toEqual(['Bob', 'Alice']);
    expect(wrapper.find('[data-testid="timer"]').text()).toBe('13 с');
  });

  it('pressing Roll sends one command and disables the button until the Ack', async () => {
    const h = harness({ stored: storedSession(TWO) });
    h.client.start();
    const wrapper = mount(App, provide(h));
    h.sockets.last().open();
    h.sockets.last().receive(welcome(playingView(['a', 'b'], { owner: 'a' })));
    await flushPromises();
    const roll = wrapper.find('[data-testid="RollDice"]');
    await roll.trigger('click');
    expect(roll.attributes('disabled')).toBeDefined();
    await roll.trigger('click');
    expect(h.sockets.last().sent.filter((f) => f.t === 'Command')).toHaveLength(1);

    h.sockets.last().receive({ t: 'Ack', commandId: 'c1', outcome: 'rejected', revision: 9, error: { code: 'DEADLINE_PASSED', message: 'Too late' } } as never);
    await flushPromises();
    expect(wrapper.find('[data-testid="message"]').text()).toContain('DEADLINE_PASSED');
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
    expect(wrapper.find('[data-testid="notice"]').text()).toContain('ROOM_UNAVAILABLE');
  });
});
