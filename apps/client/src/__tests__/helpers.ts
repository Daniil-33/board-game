import { defineComponent, h, type VNode } from 'vue';
import { UiProvider } from '../shared/ui/index';
import { PROTOCOL_VERSION } from '@game/protocol';
import { CURRENT_RULES_VERSION, generateBoard, seedRng, startingCapital, lapReward } from '@game/game-core';
import type { PlayerId, Revision, StateView, Timestamp } from '@game/game-core';
import type { ClientFrame, RoomSummary, ServerFrame } from '@game/protocol';
import type { FetchLike } from '../shared/api/index';
import { createClient, type Board, type BoardMount, type Client } from '../features/client-session/index';
import type { AnimationStep } from '../entities/game/index';
import type { SocketFactory, SocketHandlers } from '../shared/api/index';

export const pid = (id: string): PlayerId => id as PlayerId;
const rev = (n: number): Revision => n as Revision;
const ts = (n: number): Timestamp => n as Timestamp;

const BASE: StateView = {
  revision: rev(1),
  rulesVersion: CURRENT_RULES_VERSION,
  phase: 'lobby',
  mortgages: {}, eliminations: [], finishedAt: null, result: null,
  houses: {}, rent: null, rentQuotes: {}, owners: {}, purchase: null, auction: null,
  board: generateBoard(seedRng(42)).board,
  economy: null,
  balances: {},
  players: [],
  eliminated: [],
  winner: null,
  setup: null,
  order: null,
  turn: null,
  positions: {},
  jail: {},
};

export function lobbyView(players: string[], revision = 1): StateView {
  return { ...BASE, revision: rev(revision), players: players.map((id) => ({ id: pid(id) })) };
}

export interface SetupOptions {
  revision?: number;
  roller?: string;
  deadline?: number;
  groups?: string[][];
  rolls?: Record<string, number>;
  setupRollId?: string;
}

export function setupView(players: string[], o: SetupOptions = {}): StateView {
  const groups = (o.groups ?? [players]).map((g) => g.map(pid));
  const roller = pid(o.roller ?? players[0]!);
  return {
    ...lobbyView(players, o.revision ?? 5),
    phase: 'setup',
    economy: { startingCapital: startingCapital(players.length), lapReward: lapReward(startingCapital(players.length)) },
    balances: Object.fromEntries(players.map(id => [id, startingCapital(players.length)])),
    setup: {
      setupRollId: o.setupRollId ?? 's5',
      playerId: roller,
      deadline: ts(o.deadline ?? 100_000),
      groups,
      round: { groupIndex: 0, pending: [roller], rolls: o.rolls ?? {} },
    },
  };
}

export interface PlayingOptions {
  revision?: number;
  turnId?: string;
  owner?: string;
  rolled?: boolean;
  deadline?: number;
  positions?: Record<string, number>;
  jail?: Record<string, { attemptsUsed: number }>;
  bonus?: boolean;
}

export function playingView(order: string[], o: PlayingOptions = {}): StateView {
  return {
    ...lobbyView(order, o.revision ?? 9),
    phase: 'playing',
    economy: { startingCapital: startingCapital(order.length), lapReward: lapReward(startingCapital(order.length)) },
    balances: Object.fromEntries(order.map(id => [id, startingCapital(order.length)])),
    order: order.map(pid),
    turn: {
      pausedRemainingMs: null,
      turnId: o.turnId ?? 't7',
      playerId: pid(o.owner ?? order[0]!),
      deadline: ts(o.deadline ?? 100_000),
      bonus: o.bonus ?? false,
      rolled: o.rolled ?? false,
      continuation: false,
      doublesStreak: 0,
      pendingBonus: false,
      quotas: { builds: 1, offers: 2 },
    },
    positions: o.positions ?? Object.fromEntries(order.map((id) => [id, 0])),
    jail: o.jail ?? {},
  };
}

export const welcome = (view: StateView, playerId = 'a'): ServerFrame => ({
  t: 'Welcome',
  protocolVersion: PROTOCOL_VERSION,
  playerId: pid(playerId),
  revision: view.revision,
  view,
  history: { entries: [], chat: [] },
});

export const update = (view: StateView, events: { type: string; payload: unknown }[] = []): ServerFrame => ({
  t: 'Update',
  revision: view.revision,
  view,
  events,
});

// ---- Fakes -------------------------------------------------------------------

export interface FakeSocket {
  readonly url: string;
  readonly sent: ClientFrame[];
  closed: boolean;
  /** The server side accepts the connection. */
  open(): void;
  /** The server sends a frame (an object) or raw text. */
  receive(frame: ServerFrame | string): void;
  /** The connection is lost. */
  drop(): void;
}

export function fakeSockets(): { factory: SocketFactory; sockets: FakeSocket[]; last(): FakeSocket } {
  const sockets: FakeSocket[] = [];
  const factory: SocketFactory = (url: string, handlers: SocketHandlers) => {
    const socket: FakeSocket = {
      url,
      sent: [],
      closed: false,
      open: () => handlers.onOpen(),
      receive: (frame) => handlers.onMessage(typeof frame === 'string' ? frame : JSON.stringify(frame)),
      drop: () => handlers.onClose(),
    };
    sockets.push(socket);
    return {
      send: (data) => void socket.sent.push(JSON.parse(data) as ClientFrame),
      close: () => void (socket.closed = true),
    };
  };
  return { factory, sockets, last: () => sockets[sockets.length - 1]! };
}

export function fakeStorage(initial: Record<string, string> = {}): Storage & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, value),
  };
}

export interface FetchCall {
  readonly method: string;
  readonly path: string;
  readonly headers: Record<string, string>;
  readonly body: unknown;
}

export type Route = (call: FetchCall) => { status?: number; body: unknown } | undefined;

/** A `fetch` answering from `route`; records every call. */
export function fakeFetch(route: Route): { fetchFn: FetchLike; calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const fetchFn: FetchLike = async (path, init) => {
    const call: FetchCall = {
      method: init?.method ?? 'GET',
      path,
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    };
    calls.push(call);
    const reply = route(call);
    if (reply === undefined) throw new TypeError('network down');
    const status = reply.status ?? 200;
    return { ok: status >= 200 && status < 300, status, json: async () => reply.body } as Response;
  };
  return { fetchFn, calls };
}

export const GUEST = { guestId: 'a', token: 'tok-a', nickname: 'Alice' };

export function room(members: [string, string][], creatorId = members[0]![0], roomId = 'r1'): RoomSummary {
  return {
    roomId,
    creatorId,
    status: 'lobby',
    locked: false,
    joinable: members.length < 6,
    members: members.map(([guestId, nickname]) => ({ guestId, nickname })),
  };
}

export function storedSession(roomSummary?: RoomSummary): Record<string, string> {
  return {
    'game.guest': JSON.stringify(GUEST),
    ...(roomSummary !== undefined && { 'game.room': JSON.stringify(roomSummary) }),
  };
}

/** A board that records what it is told instead of drawing. */
export function recordingBoard(): Board & { steps: AnimationStep[]; snaps: { positions: Record<string, number>; activeId: string | null }[] } {
  const steps: AnimationStep[] = [];
  const snaps: { positions: Record<string, number>; activeId: string | null }[] = [];
  return {
    steps,
    snaps,
    setNames: () => {},
    snap: (view, activeId) => void snaps.push({ positions: { ...view.positions }, activeId }),
    play: async (step) => void steps.push(step),
  };
}

export interface Harness {
  client: Client;
  sockets: ReturnType<typeof fakeSockets>;
  storage: ReturnType<typeof fakeStorage>;
  calls: FetchCall[];
  board: ReturnType<typeof recordingBoard>;
  mount: BoardMount;
  clock: { now: number };
}

/** The whole client against fakes. Command ids are c1, c2, ... */
export function harness(options: { stored?: Record<string, string>; route?: Route; now?: number } = {}): Harness {
  const sockets = fakeSockets();
  const storage = fakeStorage(options.stored);
  const { fetchFn, calls } = fakeFetch(options.route ?? (() => ({ body: { rooms: [] } })));
  const clock = { now: options.now ?? 50_000 };
  let nextCommand = 1;
  const client = createClient({
    storage,
    fetchFn,
    socketFactory: sockets.factory,
    socketUrl: 'ws://test/ws',
    now: () => clock.now,
    newCommandId: () => `c${nextCommand++}`,
  });
  const board = recordingBoard();
  const mount: BoardMount = async () => ({ board, destroy: () => {} });
  return { client, sockets, storage, calls, board, mount, clock };
}

export function withUi(render: () => VNode) {
  return defineComponent({ setup: () => () => h(UiProvider, null, { default: render }) });
}
