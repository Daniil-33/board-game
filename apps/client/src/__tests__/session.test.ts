import { describe, expect, it } from 'vitest';
import { GUEST_STORAGE_KEY, ROOM_STORAGE_KEY, createSessionStore } from '../entities/session/index';
import { GUEST, fakeStorage, room, storedSession } from './helpers';

describe('session store', () => {
  it('starts empty and stores the guest in storage', () => {
    const storage = fakeStorage();
    const store = createSessionStore(storage);
    expect(store.state.guest).toBeNull();
    store.setGuest(GUEST);
    expect(JSON.parse(storage.getItem(GUEST_STORAGE_KEY)!)).toEqual(GUEST);
  });

  it('restores the guest and the room after a reload', () => {
    const storage = fakeStorage();
    const first = createSessionStore(storage);
    first.setGuest(GUEST);
    first.setRoom(room([['a', 'Alice'], ['b', 'Bob']]));

    const reloaded = createSessionStore(storage);
    expect(reloaded.state.guest).toEqual(GUEST);
    expect(reloaded.state.room?.roomId).toBe('r1');
  });

  it('clearing the guest forgets the room too', () => {
    const storage = fakeStorage(storedSession(room([['a', 'Alice']])));
    const store = createSessionStore(storage);
    store.clearGuest();
    expect(store.state).toEqual({ guest: null, room: null });
    expect(storage.getItem(GUEST_STORAGE_KEY)).toBeNull();
    expect(storage.getItem(ROOM_STORAGE_KEY)).toBeNull();
  });

  it('ignores stored data of the wrong shape', () => {
    const store = createSessionStore(
      fakeStorage({ [GUEST_STORAGE_KEY]: '{"guestId":"a"}', [ROOM_STORAGE_KEY]: 'not json' }),
    );
    expect(store.state).toEqual({ guest: null, room: null });
  });

  it('survives a storage that throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
      removeItem: () => {},
    };
    const store = createSessionStore(broken);
    store.setGuest(GUEST);
    expect(store.state.guest).toEqual(GUEST);
  });

  it('maps a view player id to the cached nickname, falling back to the id', () => {
    const store = createSessionStore(fakeStorage(storedSession(room([['a', 'Alice'], ['b', 'Bob']]))));
    expect(store.nicknameOf('b')).toBe('Bob');
    expect(store.nicknameOf('zz')).toBe('zz');
    store.clearRoom();
    expect(store.nicknameOf('a')).toBe('Alice');
  });
});
