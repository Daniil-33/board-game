import { reactive } from 'vue';
import { Type, type Static } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { GuestIdSchema, NicknameSchema, RoomSummarySchema, TokenSchema, type RoomSummary } from '@game/protocol';

/** The guest this browser is logged in as. */
const GuestSchema = Type.Object(
  { guestId: GuestIdSchema, token: TokenSchema, nickname: NicknameSchema },
  { additionalProperties: false },
);
export type Guest = Static<typeof GuestSchema>;

export const GUEST_STORAGE_KEY = 'game.guest';
/** The joined room with its member list, which doubles as the nickname cache. */
export const ROOM_STORAGE_KEY = 'game.room';

export interface SessionState {
  guest: Guest | null;
  room: RoomSummary | null;
}

export interface SessionStore {
  readonly state: SessionState;
  setGuest(guest: Guest): void;
  /** Forget the guest and the room (logout, or a rejected token). */
  clearGuest(): void;
  setRoom(room: RoomSummary): void;
  clearRoom(): void;
  /** Nickname of a view player id: room member, then the guest, then the raw id. */
  nicknameOf(playerId: string): string;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function read<T>(storage: StorageLike, key: string, check: (value: unknown) => value is T): T | null {
  try {
    const raw = storage.getItem(key);
    if (raw === null) return null;
    const value: unknown = JSON.parse(raw);
    return check(value) ? value : null;
  } catch {
    return null;
  }
}

function write(storage: StorageLike, key: string, value: unknown): void {
  try {
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage may be unavailable (private mode, quota); the session then lasts for this page only.
  }
}

/** Guest identity and current room, mirrored to `storage` so a reload keeps both. */
export function createSessionStore(storage: StorageLike): SessionStore {
  const guest = read(storage, GUEST_STORAGE_KEY, (v): v is Guest => Value.Check(GuestSchema, v));
  // A room without a guest is meaningless; it can only be left over from a broken write.
  const room = guest === null ? null : read(storage, ROOM_STORAGE_KEY, (v): v is RoomSummary => Value.Check(RoomSummarySchema, v));
  const state = reactive<SessionState>({ guest, room });

  return {
    state,
    setGuest(next) {
      state.guest = next;
      write(storage, GUEST_STORAGE_KEY, next);
    },
    clearGuest() {
      state.guest = null;
      state.room = null;
      write(storage, GUEST_STORAGE_KEY, null);
      write(storage, ROOM_STORAGE_KEY, null);
    },
    setRoom(next) {
      state.room = next;
      write(storage, ROOM_STORAGE_KEY, next);
    },
    clearRoom() {
      state.room = null;
      write(storage, ROOM_STORAGE_KEY, null);
    },
    nicknameOf(playerId) {
      // The server uses the lobby guest id as the core player id.
      const member = state.room?.members.find((m) => m.guestId === playerId);
      if (member !== undefined) return member.nickname;
      if (state.guest?.guestId === playerId) return state.guest.nickname;
      return playerId;
    },
  };
}
