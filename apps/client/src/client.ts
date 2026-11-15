/**
 * Wires the stores, the lobby API, the connection and the animation queue.
 * Everything outside (storage, fetch, sockets, clock, canvas) is injected, so
 * tests run the whole client against fakes.
 */
import { inject, reactive, type InjectionKey } from 'vue';
import { PLACEHOLDER_RING } from '@game/game-core';
import type { StateView } from '@game/game-core';
import type { ClientCommandType, RoomSummary } from '@game/protocol';
import { LobbyRequestError, createLobbyApi, type FetchLike, type LobbyApi } from './api/lobby';
import { AnimationQueue, type AnimationStep } from './game/animation';
import { activePlayerId } from './game/view';
import { createConnection, type Connection, type Timers } from './net/connection';
import type { SocketFactory } from './net/socket';
import { createGameState, type GameState } from './store/game';
import { createSessionStore, type SessionStore } from './store/session';
import type { BoardView } from './board/BoardCanvas';

/** What the client needs from a mounted board. */
export interface Board {
  setNames(nameOf: (playerId: string) => string): void;
  snap(view: BoardView, activeId: string | null): void;
  play(step: AnimationStep, speed: number): Promise<void>;
}

export interface ClientDeps {
  readonly storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  readonly fetchFn: FetchLike;
  readonly socketFactory: SocketFactory;
  readonly socketUrl: string;
  readonly now: () => number;
  readonly timers?: Timers;
  readonly newCommandId?: () => string;
}

export interface LobbyState {
  rooms: RoomSummary[];
  /** The last lobby or login error, for display. Cleared by the next request. */
  error: string | null;
  /** Why the client came back to this screen (room gone, session expired). Stays until the next room or login. */
  notice: string | null;
  busy: boolean;
}

export interface Client {
  readonly session: SessionStore;
  readonly game: GameState;
  readonly lobby: LobbyState;
  readonly connection: Connection;
  now(): number;
  /** Resume after a page load: reconnect to the stored room, if any. */
  start(): void;
  /** `nickname` must already be normalized. */
  login(nickname: string): Promise<void>;
  /** `background`: a poll; it neither blocks the buttons nor clears a shown error. */
  refreshRooms(options?: { background?: boolean }): Promise<void>;
  createRoom(): Promise<void>;
  joinRoom(roomId: string): Promise<void>;
  startGame(): Promise<void>;
  sendCommand(type: ClientCommandType): void;
  nameOf(playerId: string): string;
  /** The game screen hands over its board while mounted, null when it goes away. */
  attachBoard(board: Board | null): void;
}

export function createClient(deps: ClientDeps): Client {
  const session = createSessionStore(deps.storage);
  const game = createGameState();
  const lobby = reactive<LobbyState>({ rooms: [], error: null, notice: null, busy: false });
  const api: LobbyApi = createLobbyApi(deps.fetchFn);

  let board: Board | null = null;
  const nameOf = (playerId: string): string => session.nicknameOf(playerId);

  function snapBoard(): void {
    if (board !== null && game.view !== null) board.snap(game.view, activePlayerId(game.view));
  }

  const queue = new AnimationQueue(
    PLACEHOLDER_RING.size,
    (step, speed) => (board === null ? Promise.resolve() : board.play(step, speed)),
    // Whenever nothing is animating, tokens stand where the view says.
    snapBoard,
  );

  /** Player ids whose nickname was already looked up once. */
  const lookedUp = new Set<string>();

  /** The view names players by id only; fetch the member list once for an id we have no nickname for. */
  function resolveNames(view: StateView): void {
    const room = session.state.room;
    const token = session.state.guest?.token;
    if (room === null || token === undefined) return;
    const unknown = view.players
      .map((p) => p.id as string)
      .filter((id) => !room.members.some((m) => m.guestId === id) && !lookedUp.has(id));
    if (unknown.length === 0) return;
    unknown.forEach((id) => lookedUp.add(id));
    void api.listRooms(token).then(
      (rooms) => {
        const fresh = rooms.find((r) => r.roomId === session.state.room?.roomId);
        if (fresh !== undefined) session.setRoom(fresh);
      },
      () => {
        // Names stay as ids; the game itself is unaffected.
      },
    );
  }

  const connection = createConnection({
    state: game,
    url: deps.socketUrl,
    socketFactory: deps.socketFactory,
    token: () => session.state.guest?.token ?? null,
    ...(deps.timers !== undefined && { timers: deps.timers }),
    ...(deps.newCommandId !== undefined && { newCommandId: deps.newCommandId }),
    onWelcome(view) {
      // No delta replay in stage 1: drop what was waiting and show the view as it is.
      queue.clear();
      snapBoard();
      resolveNames(view);
    },
    onUpdate(view, events) {
      queue.enqueue(events);
      resolveNames(view);
    },
    onAuthLost() {
      session.clearGuest();
      lobby.notice = 'Your session is no longer valid. Log in again.';
    },
    onRoomLost(error) {
      session.clearRoom();
      lobby.notice = `You are back in the lobby: ${error.message} (${error.code})`;
    },
  });

  /** Run a lobby request; a rejected token returns to login, other errors are shown. */
  async function run<T>(request: (token: string) => Promise<T>): Promise<T | undefined> {
    const token = session.state.guest?.token;
    if (token === undefined) return undefined;
    lobby.busy = true;
    lobby.error = null;
    try {
      return await request(token);
    } catch (error) {
      report(error);
      return undefined;
    } finally {
      lobby.busy = false;
    }
  }

  function report(error: unknown): void {
    if (error instanceof LobbyRequestError) {
      if (error.code === 'UNAUTHENTICATED') {
        connection.disconnect();
        session.clearGuest();
      }
      lobby.error = `${error.message} (${error.code})`;
    } else {
      lobby.error = 'Unexpected error';
      console.error(error);
    }
  }

  function enterRoom(room: RoomSummary): void {
    lookedUp.clear();
    lobby.notice = null;
    session.setRoom(room);
    connection.connect(room.roomId);
  }

  return {
    session,
    game,
    lobby,
    connection,
    now: deps.now,
    nameOf,
    start() {
      const room = session.state.room;
      if (session.state.guest !== null && room !== null) connection.connect(room.roomId);
    },
    async login(nickname) {
      lobby.busy = true;
      lobby.error = null;
      try {
        const { guestId, token } = await api.guestLogin(nickname);
        lobby.notice = null;
        session.setGuest({ guestId, token, nickname });
      } catch (error) {
        report(error);
      } finally {
        lobby.busy = false;
      }
    },
    async refreshRooms(options = {}) {
      if (options.background !== true) {
        const rooms = await run((token) => api.listRooms(token));
        if (rooms !== undefined) lobby.rooms = rooms;
        return;
      }
      const token = session.state.guest?.token;
      if (token === undefined) return;
      try {
        lobby.rooms = await api.listRooms(token);
      } catch (error) {
        report(error);
      }
    },
    async createRoom() {
      const room = await run((token) => api.createRoom(token));
      if (room !== undefined) enterRoom(room);
    },
    async joinRoom(roomId) {
      const room = await run((token) => api.joinRoom(token, roomId));
      if (room !== undefined) enterRoom(room);
    },
    async startGame() {
      const roomId = session.state.room?.roomId;
      if (roomId === undefined) return;
      const room = await run((token) => api.startGame(token, roomId));
      // The game start itself arrives on the socket as an Update.
      if (room !== undefined && session.state.room?.roomId === room.roomId) session.setRoom(room);
    },
    sendCommand(type) {
      connection.sendCommand(type);
    },
    attachBoard(next) {
      board = next;
      if (board === null) return;
      board.setNames(nameOf);
      if (queue.idle) snapBoard();
    },
  };
}

export const CLIENT_KEY: InjectionKey<Client> = Symbol('client');

export function useClient(): Client {
  const client = inject(CLIENT_KEY);
  if (client === undefined) throw new Error('No client provided');
  return client;
}

/** How the game screen puts a board on the page; replaced in tests (no WebGL there). */
export type BoardMount = (host: HTMLElement) => Promise<{ board: Board; destroy(): void }>;
export const BOARD_MOUNT_KEY: InjectionKey<BoardMount> = Symbol('board-mount');
