import { t } from '../../shared/i18n/index';
/**
 * Wires the stores, the lobby API, the connection and the animation queue.
 * Everything outside (storage, fetch, sockets, clock, canvas) is injected, so
 * tests run the whole client against fakes.
 */
import { inject, reactive, type InjectionKey } from 'vue';
import { CLASSIC_40, type GameEvent, type StateView } from '@game/game-core';
import { AccessCodeSchema, RoomIdSchema, type RoomSummary } from '@game/protocol';
import { Value } from '@sinclair/typebox/value';
import { LobbyRequestError, createLobbyApi, type FetchLike, type LobbyApi } from '../../shared/api/index';
import { appendNotices, debtNotices } from '../../entities/game/index';
import { AnimationQueue, type AnimationStep } from '../../entities/game/index';
import { activePlayerId, type IntentRequest } from '../../entities/game/index';
import { createConnection, type Connection, type Timers } from '../../shared/api/index';
import type { SocketFactory } from '../../shared/api/index';
import { createGameState, type GameState } from '../../entities/game/index';
import { createSessionStore, type SessionStore } from '../../entities/session/index';
import { createChatStore, type ChatStore } from '../../entities/chat/index';
import { createEventLog, type EventLog } from '../../entities/event/index';
import type { Board } from '../../entities/game/index';
export type { Board } from '../../entities/game/index';

export interface ClientDeps {
  readonly storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  readonly fetchFn: FetchLike;
  readonly socketFactory: SocketFactory;
  readonly socketUrl: string;
  readonly now: () => number;
  readonly timers?: Timers;
  readonly newCommandId?: () => string;
  readonly initialUrl?: string;
  readonly replaceUrl?: (url: string) => void;
}

export interface LobbyState {
  rooms: RoomSummary[];
  /** The last lobby or login error, for display. Cleared by the next request. */
  error: string | null;
  /** Why the client came back to this screen (room gone, session expired). Stays until the next room or login. */
  notice: string | null;
  busy: boolean;
  inviteRoomId: string | null;
  creatorAccess: { accessCode: string; inviteLink: string } | null;
}

export interface Client {
  readonly session: SessionStore;
  readonly game: GameState;
  readonly lobby: LobbyState;
  /** Room chat; send with `features/send-chat` over `connection`. */
  readonly chat: ChatStore;
  /** The viewer's event log: Welcome history, then each Update's events. */
  readonly events: EventLog;
  readonly connection: Connection;
  now(): number;
  /** Resume after a page load: reconnect to the stored room, if any. */
  start(): void;
  /** `nickname` must already be normalized. */
  login(nickname: string): Promise<void>;
  /** Background polls do not block controls; successful polls clear prior polling errors. */
  refreshRooms(options?: { background?: boolean }): Promise<void>;
  createRoom(accessCode?: string): Promise<void>;
  joinRoom(roomId: string, accessCode?: string): Promise<void>;
  retryInvite(): Promise<void>;
  dismissInvite(): void;
  leaveRoom(): Promise<void>;
  returnToLobby(): void;
  startGame(): Promise<void>;
  /** A null-payload command by type, or a command with its protocol payload. */
  sendCommand(request: IntentRequest): void;
  nameOf(playerId: string): string;
  /** The game screen hands over its board while mounted, null when it goes away. */
  attachBoard(board: Board | null): void;
}

export function createClient(deps: ClientDeps): Client {
  const session = createSessionStore(deps.storage);
  const game = createGameState();
  const chat = createChatStore();
  const events = createEventLog();
  const lobby = reactive<LobbyState>({ rooms: [], error: null, notice: null, busy: false, inviteRoomId: null, creatorAccess: null });
  const api: LobbyApi = createLobbyApi(deps.fetchFn);

  let board: Board | null = null;
  const nameOf = (playerId: string): string => session.nicknameOf(playerId);

  function snapBoard(): void {
    if (board !== null && game.view !== null) board.snap(game.view, activePlayerId(game.view));
  }

  const queue = new AnimationQueue(
    CLASSIC_40.size,
    (step, speed) => (board === null ? Promise.resolve() : board.play(step, speed)),
    // Whenever nothing is animating, tokens stand where the view says.
    snapBoard,
  );

  let eliminatedKey = '';
  let entry = 0;
  let leavingEntry: number | null = null;
  let operation = 0;
  let poll = 0;
  let errorSource: 'poll' | 'foreground' | null = null;
  let namesFlight: { entry: number; again: boolean } | null = null;
  let invite: { roomId: string; accessCode?: string } | null = null;
  if (deps.initialUrl !== undefined) {
    const url = new URL(deps.initialUrl);
    const roomId = url.searchParams.get('room');
    const accessCode = url.searchParams.get('code');
    if (roomId !== null && Value.Check(RoomIdSchema, roomId) &&
        (accessCode === null || Value.Check(AccessCodeSchema, accessCode))) {
      invite = { roomId, ...(accessCode !== null && { accessCode }) };
      lobby.inviteRoomId = roomId;
    } else if (roomId !== null || accessCode !== null) {
      lobby.error = t('client.invalid_invite_link');
    }
    if (url.searchParams.has('room') || url.searchParams.has('code')) {
      url.searchParams.delete('room');
      url.searchParams.delete('code');
      deps.replaceUrl?.(url.pathname + url.search + url.hash);
    }
  }

  function cleanup(notice: string): void {
    entry++;
    leavingEntry = null;
    operation++;
    namesFlight = null;
    connection.disconnect();
    queue.clear();
    session.clearRoom();
    game.notices.splice(0);
    chat.clear();
    events.clear();
    lobby.creatorAccess = null;
    lobby.busy = false;
    lobby.error = null;
    errorSource = null;
    lobby.notice = notice;
  }

  /** Coalesce roster refreshes while preserving a request arriving in flight. */
  function resolveNames(): void {
    const roomId = session.state.room?.roomId;
    const token = session.state.guest?.token;
    if (roomId === undefined || token === undefined) return;
    if (namesFlight?.entry === entry) { namesFlight.again = true; return; }
    const flight = { entry, again: false };
    namesFlight = flight;
    void (async () => {
      do {
        flight.again = false;
        try {
          const fresh = await api.getRoom(token, roomId);
          if (entry !== flight.entry || session.state.room?.roomId !== roomId) return;
          if (fresh.status === 'closed') { cleanup(t('client.room_closed')); return; }
          session.setRoom(fresh);
        } catch (error) {
          if (entry !== flight.entry) return;
          if (error instanceof LobbyRequestError && ['ROOM_CLOSED', 'NOT_A_PARTICIPANT', 'ROOM_UNAVAILABLE'].includes(error.code)) {
            cleanup(error.code === 'NOT_A_PARTICIPANT' && leavingEntry === entry
              ? t('client.room_left')
              : t('client.room_unavailable')); return;
          }
          if (error instanceof LobbyRequestError && error.code === 'UNAUTHENTICATED') { report(error); return; }
          // A later Welcome or membership event can retry a transient failed lookup.
        }
      } while (flight.again && entry === flight.entry);
      if (namesFlight === flight) namesFlight = null;
    })();
  }

  const connection = createConnection({
    state: game,
    url: deps.socketUrl,
    socketFactory: deps.socketFactory,
    token: () => session.state.guest?.token ?? null,
    ...(deps.timers !== undefined && { timers: deps.timers }),
    ...(deps.newCommandId !== undefined && { newCommandId: deps.newCommandId }),
    onWelcome(view, history) {
      // The log and chat as of this Welcome; never animated.
      events.replace(history.entries);
      chat.replace(history.chat);
      board?.refreshOwnership?.(view);
      eliminatedKey = JSON.stringify(view.eliminated);
      // No delta replay in stage 1: drop what was waiting and show the view as it is.
      queue.clear();
      snapBoard();
      resolveNames();
    },
    onUpdate(view, updateEvents, revision) {
      // The Update frame carries no commit time: the log entry is stamped on receipt.
      events.append({ revision, at: deps.now(), events: [...updateEvents] });
      onViewUpdate(view, updateEvents);
    },
    onChat(message) {
      chat.receive(message);
    },
    onChatAck(ack) {
      chat.acknowledge(ack);
    },
    onAuthLost() {
      cleanup('');
      session.clearGuest();
      lobby.notice = t('client.session_expired');
    },
    onRoomLost(error) {
      cleanup(error.code === 'NOT_A_PARTICIPANT' && leavingEntry === entry
        ? t('client.room_left')
        : t('client.return_reason', { message: error.message, code: error.code }));
    },
  });

  function onViewUpdate(view: StateView, events: readonly GameEvent[]): void {
    // Before animation handling: a terminal update cancels the queue, and its bankruptcy must still show.
    appendNotices(game.notices, debtNotices(events));
    board?.refreshOwnership?.(view);
    const nextEliminated = JSON.stringify(view.eliminated);
    if (nextEliminated !== eliminatedKey || view.phase === 'finished' || events.some((e) => e.type === 'PlayerResigned' || e.type === 'GameEnded')) {
      queue.clear();
      snapBoard();
    } else queue.enqueue(events);
    eliminatedKey = nextEliminated;
    if (events.some((e) => e.type === 'PlayerAdded' || e.type === 'PlayerLeftLobby')) resolveNames();
  }

  /** Run a lobby request; a rejected token returns to login, other errors are shown. */
  async function run<T>(request: (token: string) => Promise<T>): Promise<T | undefined> {
    const token = session.state.guest?.token;
    if (token === undefined || lobby.busy) return undefined;
    const mine = ++operation;
    const entered = entry;
    lobby.busy = true;
    lobby.error = null;
    errorSource = 'foreground';
    try {
      const value = await request(token);
      if (mine === operation && entered === entry) errorSource = null;
      return mine === operation && entered === entry && session.state.guest?.token === token ? value : undefined;
    } catch (error) {
      if (mine === operation && entered === entry) report(error);
      return undefined;
    } finally {
      if (mine === operation) lobby.busy = false;
    }
  }

  function report(error: unknown): void {
    if (error instanceof LobbyRequestError) {
      if (error.code === 'UNAUTHENTICATED') {
        cleanup(t('client.session_expired'));
        session.clearGuest();
      }
      lobby.error = t('client.error', { message: error.message, code: error.code });
    } else {
      lobby.error = t('client.unexpected_error');
      // Never log request bodies or URLs: they may contain invite secrets.
    }
  }

  function enterRoom(room: RoomSummary): void {
    game.notices.splice(0);
    entry++;
    namesFlight = null;
    lobby.creatorAccess = null;
    lobby.notice = null;
    session.setRoom(room);
    connection.connect(room.roomId);
    resolveNames();
  }

  async function joinInvite(): Promise<void> {
    const pending = invite;
    if (pending === null || lobby.busy) return;
    const room = await run((token) => api.joinRoom(token, pending.roomId, pending.accessCode));
    if (room !== undefined && invite === pending) {
      invite = null;
      lobby.inviteRoomId = null;
      enterRoom(room);
    }
  }

  return {
    session,
    game,
    lobby,
    chat,
    events,
    connection,
    now: deps.now,
    nameOf,
    start() {
      if (invite !== null) {
        cleanup(t('client.joining_invite'));
        void joinInvite();
      } else {
        const room = session.state.room;
        if (session.state.guest !== null && room !== null) enterRoom(room);
      }
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
      if (session.state.guest !== null) await joinInvite();
    },
    async refreshRooms(options = {}) {
      if (options.background !== true) {
        const rooms = await run((token) => api.listRooms(token));
        if (rooms !== undefined) { lobby.rooms = rooms; errorSource = null; }
        return;
      }
      const token = session.state.guest?.token;
      if (token === undefined) return;
      const mine = ++poll;
      const foreground = operation;
      try {
        const rooms = await api.listRooms(token);
        if (mine !== poll || foreground !== operation || session.state.guest?.token !== token) return;
        lobby.rooms = rooms;
        if (errorSource === 'poll') { lobby.error = null; errorSource = null; }
      } catch (error) {
        if (mine !== poll || foreground !== operation || lobby.busy || errorSource === 'foreground') return;
        report(error);
        errorSource = 'poll';
      }
    },
    async createRoom(accessCode) {
      const result = await run((token) => api.createRoom(token, accessCode));
      if (result !== undefined) {
        invite = null;
        lobby.inviteRoomId = null;
        enterRoom(result.room);
        if (result.accessCode !== undefined && result.inviteLink !== undefined) {
          lobby.creatorAccess = { accessCode: result.accessCode, inviteLink: new URL(result.inviteLink, deps.initialUrl ?? 'http://localhost').href };
        }
      }
    },
    async joinRoom(roomId, accessCode) {
      const room = await run((token) => api.joinRoom(token, roomId, accessCode));
      if (room !== undefined) { invite = null; lobby.inviteRoomId = null; enterRoom(room); }
    },
    retryInvite: joinInvite,
    dismissInvite() { invite = null; lobby.inviteRoomId = null; lobby.error = null; },
    async leaveRoom() {
      const room = session.state.room;
      if (lobby.busy || room === null || (game.view !== null && game.view.phase !== 'lobby') || room.status !== 'lobby') return;
      leavingEntry = entry;
      const result = await run((token) => api.leaveRoom(token, room.roomId));
      leavingEntry = null;
      if (result !== undefined) cleanup(result.status === 'closed' ? t('client.room_closed') : t('client.room_left'));
    },
    returnToLobby() { cleanup(t('client.returned_to_lobby')); },
    async startGame() {
      const roomId = session.state.room?.roomId;
      if (roomId === undefined) return;
      const room = await run((token) => api.startGame(token, roomId));
      // The game start itself arrives on the socket as an Update.
      if (room !== undefined && session.state.room?.roomId === room.roomId) session.setRoom(room);
    },
    sendCommand(request) {
      connection.sendCommand(request);
    },
    attachBoard(next) {
      board = next;
      if (board === null) return;
      board.setNames(nameOf);
      if (game.view !== null) board.refreshOwnership?.(game.view);
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
