import { DOMWrapper, enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StateView } from '@game/game-core';
import { App } from '../app/index';
import { CLIENT_KEY, BOARD_MOUNT_KEY, createClient } from '../features/client-session/index';
import { runtimeApi } from '../shared/api/index';
import { createLobbyApi } from '../shared/api/index';
import { canIssue, turnOrder } from '../entities/game/index';
import { fakeFetch, fakeSockets, fakeStorage, harness, room, storedSession, lobbyView, playingView, setupView, welcome, update, pid } from './helpers';

const TWO = room([['a', 'Alice'], ['b', 'Bob']]);
const THREE = room([['a', 'Alice'], ['b', 'Bob'], ['c', 'Carol']]);
enableAutoUnmount(afterEach);
const body = new DOMWrapper(document.body);

const provide = (h: ReturnType<typeof harness>) => ({ global: { provide: { [CLIENT_KEY as symbol]: h.client, [BOARD_MOUNT_KEY as symbol]: h.mount } } });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}
const response = (body: unknown, status = 200): Response => ({ ok: status < 300, status, json: async () => body }) as Response;

function clientWithFetch(fetchFn: (url: string, init?: RequestInit) => Promise<Response>, initialUrl?: string, stored = storedSession(TWO)) {
  const storage = fakeStorage(stored);
  const sockets = fakeSockets();
  const replaceUrl = vi.fn();
  const client = createClient({ storage, socketFactory: sockets.factory, socketUrl: 'ws://test/ws', now: () => 50_000, fetchFn,
    ...(initialUrl !== undefined && { initialUrl }), replaceUrl });
  return { client, sockets, storage, replaceUrl };
}

describe('checked lobby API additions', () => {
  it('retains create secrets, sends optional codes, encodes get and leave paths', async () => {
    const { fetchFn, calls } = fakeFetch((c) => ({ body: c.path === '/api/rooms' ? { room: TWO, accessCode: 'abcd', inviteLink: '/?room=r1&code=abcd' } : { room: TWO } }));
    const api = createLobbyApi(fetchFn);
    expect(await api.createRoom('tok', 'abcd')).toMatchObject({ accessCode: 'abcd', inviteLink: '/?room=r1&code=abcd' });
    await api.joinRoom('tok', 'r 1', 'abcd');
    await api.getRoom('tok', 'r 1');
    await api.leaveRoom('tok', 'r 1');
    expect(calls.map((c) => [c.method, c.path, c.body])).toEqual([
      ['POST', '/api/rooms', { accessCode: 'abcd' }], ['POST', '/api/rooms/r%201/join', { accessCode: 'abcd' }],
      ['GET', '/api/rooms/r%201', undefined], ['POST', '/api/rooms/r%201/leave', undefined],
    ]);
    await expect(api.createRoom('tok', 'bad code')).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(calls).toHaveLength(4);
  });

  it.each(['getRoom', 'leaveRoom'] as const)('%s rejects malformed responses and passes closure errors through', async (method) => {
    const bad = createLobbyApi(fakeFetch(() => ({ body: { room: { ...TWO, locked: undefined } } })).fetchFn);
    await expect(bad[method]('tok', 'r1')).rejects.toMatchObject({ code: 'BAD_RESPONSE' });
    const closed = createLobbyApi(fakeFetch(() => ({ status: 409, body: { code: 'ROOM_CLOSED', message: 'Closed' } })).fetchFn);
    await expect(closed[method]('tok', 'r1')).rejects.toMatchObject({ code: 'ROOM_CLOSED' });
  });
});

describe('invites and creator secrets', () => {
  it('creates invites on the client origin with a distinct runtime API host', async () => {
    const { fetchFn, calls } = fakeFetch(() => ({ body: { room: TWO, accessCode: 'abcd', inviteLink: '/?room=r1&code=abcd' } }));
    const api = runtimeApi({ protocol: 'https:', host: 'stage.focusima.space' }, 'https://stage-api.focusima.space');
    const h = clientWithFetch(api.fetch(fetchFn), 'https://stage.focusima.space/');
    await h.client.createRoom('abcd');
    expect(calls[0]!.path).toBe('https://stage-api.focusima.space/api/rooms');
    expect(h.client.lobby.creatorAccess?.inviteLink).toBe('https://stage.focusima.space/?room=r1&code=abcd');
  });

  it('consumes invite query, continues after login, and never stores codes', async () => {
    const { fetchFn, calls } = fakeFetch((c) => c.path === '/api/guests' ? { body: { guestId: 'a', token: 'tok-a' } } : { body: { room: TWO } });
    const h = clientWithFetch(fetchFn, 'http://test/?room=r1&code=abcd&keep=yes#section', {});
    h.client.start();
    expect(h.replaceUrl).toHaveBeenCalledWith('/?keep=yes#section');
    expect(calls).toHaveLength(0);
    await h.client.login('Alice');
    expect(calls.find((c) => c.path.endsWith('/join'))?.body).toEqual({ accessCode: 'abcd' });
    expect(h.client.session.state.room?.roomId).toBe('r1');
    expect([...h.storage.data.values()].join()).not.toContain('abcd');
    expect(h.client.lobby.inviteRoomId).toBeNull();
  });

  it('invite supersedes stored-room reconnect, preserves explicit retry on failure and survives token rejection', async () => {
    let rejectToken = true;
    const { fetchFn, calls } = fakeFetch((c) => {
      if (c.path === '/api/guests') return { body: { guestId: 'a', token: 'new-token' } };
      if (c.path.endsWith('/join')) return rejectToken ? { status: 401, body: { code: 'UNAUTHENTICATED', message: 'Expired' } } : { body: { room: { ...TWO, roomId: 'invited' } } };
      return { body: { room: { ...TWO, roomId: 'invited' } } };
    });
    const h = clientWithFetch(fetchFn, 'http://test/?room=invited&code=abcd');
    h.client.start();
    await flushPromises();
    expect(h.sockets.sockets).toHaveLength(0);
    expect(h.client.session.state.guest).toBeNull();
    expect(h.client.lobby.inviteRoomId).toBe('invited');
    rejectToken = false;
    await h.client.login('Alice');
    expect(h.sockets.sockets).toHaveLength(1);
    h.sockets.last().open();
    expect(h.sockets.last().sent[0]).toMatchObject({ gameId: 'invited' });
    expect(calls.filter((c) => c.path.endsWith('/join'))).toHaveLength(2);
  });

  it('join failure does not loop; retry and dismiss are explicit', async () => {
    const { fetchFn, calls } = fakeFetch(() => ({ status: 403, body: { code: 'ACCESS_CODE_INVALID', message: 'Incorrect code' } }));
    const h = clientWithFetch(fetchFn, 'http://test/?room=invited&code=abcd');
    h.client.start(); await flushPromises();
    expect(h.client.lobby.error).toContain('ACCESS_CODE_INVALID');
    expect(calls).toHaveLength(1);
    await h.client.retryInvite(); expect(calls).toHaveLength(2);
    h.client.dismissInvite(); await h.client.retryInvite(); expect(calls).toHaveLength(2);
    expect(h.client.lobby.inviteRoomId).toBeNull();
  });

  it('creator sees code and selectable link; clipboard failure leaves a useful fallback', async () => {
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('Denied'));
    const h = harness({ stored: storedSession(), route: (c) => c.path === '/api/rooms' && c.method === 'POST'
      ? { body: { room: { ...TWO, locked: true, joinable: false }, accessCode: 'abcd', inviteLink: '/?room=r1&code=abcd' } }
      : c.path === '/api/rooms/r1' ? { body: { room: TWO } } : { body: { rooms: [] } } });
    const wrapper = mount(App, provide(h));
    await flushPromises();
    await wrapper.get('[data-testid="open-create"]').trigger('click');
    await body.get('[data-testid="create-code"]').setValue('abcd');
    await body.get('[role=dialog] form').trigger('submit'); await flushPromises();
    expect(wrapper.get('[data-testid="access-code"]').text()).toBe('abcd');
    expect((wrapper.get('[data-testid="invite-link"]').element as HTMLInputElement).value).toContain('/?room=r1&code=abcd');
    await wrapper.get('[data-testid="copy-invite"]').trigger('click'); await flushPromises();
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/?room=r1&code=abcd'));
    expect(wrapper.get('p[role="status"]').text()).toContain('Не удалось скопировать');
    expect(wrapper.get('[data-testid="invite-link"]').attributes('readonly')).toBeDefined();
    expect([...h.storage.data.values()].join()).not.toContain('abcd');
    wrapper.unmount();
  });
});

describe('lobby availability and recovery', () => {
  it('labels all rooms, joins open rooms in one click, keeps locked entry after invalid code, disables unavailable rooms', async () => {
    const open = { ...TWO, roomId: 'open' };
    const locked = { ...TWO, roomId: 'locked', locked: true, joinable: false };
    const playing = { ...TWO, roomId: 'playing', status: 'playing' as const, joinable: false };
    const full = { ...TWO, roomId: 'full', joinable: false, members: Array.from({ length: 6 }, (_, i) => ({ guestId: `g${i}`, nickname: `G${i}` })) };
    const h = harness({ stored: storedSession(), route: (c) => c.method === 'GET' ? { body: { rooms: [open, locked, playing, full] } }
      : c.path.includes('/locked/') ? { status: 403, body: { code: 'ACCESS_CODE_INVALID', message: 'Wrong code' } } : { body: { room: open } } });
    const wrapper = mount(App, provide(h)); await flushPromises();
    const rows = wrapper.findAll('[data-testid="room"]');
    expect(rows.map((r) => r.get('[data-testid="room-status"]').text())).toEqual(['Открытая', 'Закрытая', 'Идёт партия', 'Мест нет']);
    expect(rows[2]!.get('[data-testid="join"]').attributes('disabled')).toBeDefined();
    expect(rows[3]!.get('[data-testid="join"]').attributes('disabled')).toBeDefined();
    await rows[1]!.get('[data-testid="join"]').trigger('click');
    const form = body.get('[data-testid="join-form"]');
    expect((form.get('select').element as HTMLSelectElement).value).toBe('locked');
    await form.get('[data-testid="join-code"]').setValue('abcd');
    await form.trigger('submit'); await flushPromises();
    expect(body.get('[role="alert"]').text()).toContain('ACCESS_CODE_INVALID');
    expect(body.find('[data-testid="join-code"]').exists()).toBe(true);
    await rows[0]!.get('[data-testid="join"]').trigger('click'); await flushPromises();
    expect(h.calls.find((c) => c.path === '/api/rooms/open/join')?.body).toBeUndefined();
    wrapper.unmount();
  });

  it.each(['[data-testid="join-by-code"]', '[data-testid="room"] [data-testid="join"]'])(
    'returns focus to %s after closing locked-room entry',
    async (selector) => {
      const locked = { ...TWO, locked: true, joinable: false };
      const h = harness({ stored: storedSession(), route: () => ({ body: { rooms: [locked] } }) });
      const wrapper = mount(App, { ...provide(h), attachTo: document.body });
      await flushPromises();
      const opener = wrapper.get(selector);
      (opener.element as HTMLButtonElement).focus();
      await opener.trigger('click');
      const dialog = body.get('[role="dialog"]');
      await vi.waitFor(() => expect(dialog.element.contains(document.activeElement)).toBe(true));

      await new DOMWrapper(document.activeElement!).trigger('keydown', { key: 'Escape' });
      await vi.waitFor(() => {
        expect(body.find('[role="dialog"]').exists()).toBe(false);
        expect(document.activeElement).toBe(opener.element);
      });
    },
  );

  it('a successful poll clears its preceding poll error', async () => {
    let fail = true;
    const h = harness({ stored: storedSession(), route: () => fail ? undefined : { body: { rooms: [TWO] } } });
    await h.client.refreshRooms({ background: true });
    expect(h.client.lobby.error).toContain('NETWORK_ERROR');
    fail = false; await h.client.refreshRooms({ background: true });
    expect(h.client.lobby.error).toBeNull(); expect(h.client.lobby.rooms).toEqual([TWO]);
  });

  it('a late poll cannot erase a newer foreground error', async () => {
    const poll = deferred<Response>();
    const h = clientWithFetch((url) => url === '/api/rooms' ? poll.promise : Promise.resolve(response({ code: 'ACCESS_CODE_INVALID', message: 'Wrong' }, 403)), undefined, storedSession());
    const pending = h.client.refreshRooms({ background: true });
    await h.client.joinRoom('locked', 'abcd');
    poll.resolve(response({ rooms: [TWO] })); await pending;
    expect(h.client.lobby.error).toContain('ACCESS_CODE_INVALID');
  });
});

describe('roster and room entry lifetime', () => {
  it('coalesces membership events in flight and refreshes names after a failed lookup', async () => {
    const first = deferred<Response>(); let count = 0;
    const h = clientWithFetch(() => ++count === 1 ? first.promise : Promise.resolve(response({ room: THREE })));
    h.client.start(); h.sockets.last().open();
    h.sockets.last().receive(welcome(lobbyView(['a', 'b'])));
    h.sockets.last().receive(update(lobbyView(['a', 'b', 'c'], 2), [{ type: 'PlayerAdded', payload: { playerId: 'c' } }]));
    first.resolve(response({ bad: true })); await flushPromises();
    expect(count).toBe(2); expect(h.client.nameOf('c')).toBe('Carol');
    h.sockets.last().receive(update(lobbyView(['a', 'b'], 3), [{ type: 'PlayerLeftLobby', payload: { playerId: 'c' } }]));
    await flushPromises(); expect(count).toBe(3);
  });

  it('late lookup does not restore a departed room or overwrite re-entry to the same room', async () => {
    const stale = deferred<Response>(); let count = 0;
    const h = clientWithFetch((url) => {
      if (url === '/api/rooms/r1' && ++count === 1) return stale.promise;
      return Promise.resolve(response({ room: THREE }));
    });
    h.client.start(); h.client.returnToLobby();
    await h.client.joinRoom('r1'); await flushPromises();
    expect(h.client.nameOf('c')).toBe('Carol');
    stale.resolve(response({ room: TWO })); await flushPromises();
    expect(h.client.nameOf('c')).toBe('Carol');
    h.client.returnToLobby(); expect(h.client.session.state.room).toBeNull();
  });

  it('closed get-room and socket closure return to lobby with a notice', async () => {
    const h = clientWithFetch(async () => response({ room: { ...TWO, status: 'closed', joinable: false } }));
    h.client.start(); await flushPromises();
    expect(h.client.session.state.room).toBeNull(); expect(h.client.lobby.notice).toContain('закрыта');
    const another = harness({ stored: storedSession(TWO) }); another.client.start();
    another.sockets.last().receive({ t: 'Error', code: 'ROOM_CLOSED', message: 'The host closed the room' });
    expect(another.client.session.state.room).toBeNull(); expect(another.client.lobby.notice).toContain('The host closed the room');
  });

  it('leave failure retains the room; successful leave clears local state with a message', async () => {
    let fail = true;
    const h = harness({ stored: storedSession(TWO), route: (c) => c.path.endsWith('/leave') && fail
      ? { status: 409, body: { code: 'PHASE_NOT_ALLOWED', message: 'Wait' } } : { body: { room: TWO } } });
    h.client.start(); await flushPromises();
    await h.client.leaveRoom(); expect(h.client.session.state.room).not.toBeNull(); expect(h.client.lobby.error).toContain('PHASE_NOT_ALLOWED');
    fail = false; await h.client.leaveRoom();
    expect(h.client.session.state.room).toBeNull(); expect(h.client.lobby.notice).toContain('вышли'); expect(h.sockets.last().closed).toBe(true);
  });
});

describe('resignation, spectator and game over', () => {
  it('resignation ignores turn/deadline, uses held frame revision, rejects duplicate sends and permits retry after rejection', async () => {
    const h = harness({ stored: storedSession(TWO) }); h.client.start(); const sock = h.sockets.last(); sock.open();
    const view = playingView(['a', 'b'], { owner: 'b', deadline: 1, revision: 999 });
    sock.receive({ ...welcome(view), revision: 12 } as never);
    const wrapper = mount(App, provide(h)); await flushPromises();
    await wrapper.get('[data-testid="Resign"]').trigger('click');
    expect(wrapper.text()).toContain('нельзя отменить');
    await wrapper.get('[data-testid="cancel-resign"]').trigger('click');
    expect(sock.sent.filter((f) => f.t === 'Command')).toHaveLength(0);
    await wrapper.get('[data-testid="Resign"]').trigger('click');
    await wrapper.get('[data-testid="confirm-resign"]').trigger('click');
    h.client.sendCommand('Resign');
    expect(sock.sent.filter((f) => f.t === 'Command')).toEqual([{ t: 'Command', commandId: 'c1', type: 'Resign', expected: { kind: 'revision', revision: 12 }, payload: null }]);
    expect(h.client.game.view?.eliminated).toEqual([]);
    sock.receive({ t: 'Ack', commandId: 'c1', outcome: 'rejected', revision: 12, error: { code: 'REVISION_MISMATCH', message: 'Changed' } } as never);
    await flushPromises(); expect(wrapper.text()).toContain('REVISION_MISMATCH');
    sock.receive({ ...update(view), revision: 13 } as never);
    await wrapper.get('[data-testid="Resign"]').trigger('click'); await wrapper.get('[data-testid="confirm-resign"]').trigger('click');
    expect(sock.sent.at(-1)).toMatchObject({ expected: { kind: 'revision', revision: 13 } });
    wrapper.unmount();
  });

  it.each(['setup', 'playing'] as const)('%s permits off-turn resignation and denies spectators all commands', (phase) => {
    const view = phase === 'setup' ? setupView(['a', 'b'], { roller: 'b', deadline: 1 }) : playingView(['a', 'b'], { owner: 'b', deadline: 1 });
    const context = { view, me: pid('a'), connected: true, pending: [], now: 999999 };
    expect(canIssue(context, 'Resign')).toBe(true);
    for (const type of ['Resign', 'RollDice', 'RollForOrder', 'EndTurn'] as const) expect(canIssue({ ...context, view: { ...view, eliminated: [pid('a')] } }, type)).toBe(false);
  });

  it('spectator remains connected, receives projections and stays in HUD after leaving active order', async () => {
    const h = harness({ stored: storedSession(THREE) }); h.client.start(); h.sockets.last().open(); h.sockets.last().receive(welcome(playingView(['a', 'b', 'c'])));
    const wrapper = mount(App, provide(h)); await flushPromises();
    const next = { ...playingView(['a', 'b', 'c'], { revision: 10, owner: 'b' }), order: [pid('b'), pid('c')], eliminated: [pid('a')] };
    h.sockets.last().receive(update(next, [{ type: 'PlayerResigned', payload: { playerId: 'a' } }])); await flushPromises();
    expect(h.client.game.connected).toBe(true); expect(wrapper.get('[data-testid="spectator"]').text()).toContain('Вы выбыли');
    expect(turnOrder(next).map((e) => [e.playerId, e.eliminated])).toEqual([['b', false], ['c', false], ['a', true]]);
    expect(wrapper.get('[data-testid="out"]').text()).toBe('выбыл');
    expect(wrapper.get('[data-testid="Resign"]').attributes('disabled')).toBeDefined();
    h.sockets.last().receive(update({ ...next, revision: 11 as never, positions: { b: 5, c: 7 } })); await flushPromises();
    expect(h.client.game.view?.positions.b).toBe(5); wrapper.unmount();
  });

  it.each(['setup', 'playing'] as const)('finished from %s shows authoritative winner to eliminated viewer; return is local', async (phase) => {
    const h = harness({ stored: storedSession(TWO) }); h.client.start(); h.sockets.last().open();
    const before = phase === 'setup' ? setupView(['a', 'b']) : playingView(['a', 'b']);
    h.sockets.last().receive(welcome(before)); const wrapper = mount(App, provide(h)); await flushPromises();
    const eliminations = [{ playerId: pid('a'), reason: 'resigned' as const, at: 15 as never, creditorId: null }];
    const finished: StateView = { ...before, revision: 20 as never, phase: 'finished', eliminated: [pid('a')], winner: pid('b'), setup: null, turn: null,
      eliminations, finishedAt: 15 as never, result: { winner: pid('b'), finishedAt: 15 as never, eliminations, finalBalances: before.balances } };
    h.sockets.last().receive(update(finished)); await flushPromises();
    expect(wrapper.attributes('data-screen')).toBe('finished'); expect(wrapper.get('[data-testid="winner"]').text()).toBe('Победитель: Bob');
    await wrapper.get('[data-testid="return-lobby"]').trigger('click'); await flushPromises();
    expect(wrapper.attributes('data-screen')).toBe('lobby'); expect(h.calls.some((c) => c.path.endsWith('/leave'))).toBe(false);
    expect(h.sockets.last().closed).toBe(true); wrapper.unmount();
  });

  it('replacement stops retries and clears pending without erasing shared storage', async () => {
    vi.useFakeTimers(); const h = harness({ stored: storedSession(TWO) }); h.client.start(); const sock = h.sockets.last(); sock.open(); sock.receive(welcome(playingView(['a', 'b'])));
    h.client.sendCommand('Resign'); sock.receive({ t: 'Error', code: 'CONNECTION_REPLACED', message: 'Other tab' }); sock.drop();
    vi.advanceTimersByTime(60000); expect(h.sockets.sockets).toHaveLength(1); expect(h.client.game.pending).toEqual([]);
    expect(h.client.game.fatal).toContain('другой вкладке'); expect(h.storage.getItem('game.room')).not.toBeNull(); expect(h.storage.getItem('game.guest')).not.toBeNull();
    await flushPromises();
  });
});

describe('own leave socket and HTTP ordering', () => {
  it.each(['socket-first', 'http-first'] as const)('%s treats creator removal as a normal leave without an error banner', async (order) => {
    const pendingLeave = deferred<Response>();
    const h = clientWithFetch((url) => url.endsWith('/leave') ? pendingLeave.promise : Promise.resolve(response({ room: TWO })));
    h.client.start(); h.sockets.last().open(); h.sockets.last().receive(welcome(lobbyView(['a', 'b'])));
    await flushPromises();
    const sock = h.sockets.last();
    const leave = h.client.leaveRoom();
    if (order === 'socket-first') {
      sock.receive(update(lobbyView(['b'], 2), [{ type: 'PlayerLeftLobby', payload: { playerId: 'a' } }]));
      sock.receive({ t: 'Error', code: 'NOT_A_PARTICIPANT', message: 'You are not a member' });
    }
    pendingLeave.resolve(response({ room: { ...TWO, status: 'closed', joinable: false, members: [TWO.members[1]] } }));
    await leave;
    if (order === 'http-first') sock.receive({ t: 'Error', code: 'NOT_A_PARTICIPANT', message: 'You are not a member' });
    await flushPromises();
    expect(h.client.session.state.room).toBeNull();
    expect(h.client.lobby.error).toBeNull();
    expect(h.client.lobby.notice).toMatch(/вышли|закрыта/);
    expect(h.client.lobby.notice).not.toContain('NOT_A_PARTICIPANT');
  });
});
