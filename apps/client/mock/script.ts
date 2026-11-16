/**
 * DEV-ONLY script of the mock game: fixed dice, in the order they are rolled.
 * Chosen to show, in a two-player game where the human created the room:
 * an order-roll tie and reroll, a normal move, a double with a bonus turn, a
 * third double to jail, a failed jail attempt and a release on a double.
 */

/** Order-roll dice. 4, 4 ties the first two rollers; the reroll 2, 6 resolves it. */
export const ORDER_DICE: readonly number[] = [4, 4, 2, 6, 3, 5, 1];

/** Turn dice, consumed one pair per roll, by whoever rolls. */
export const TURN_DICE: readonly (readonly [number, number])[] = [
  [1, 2], // first player: a normal move onto a free asset (purchase decision)
  [2, 2], // second player: a double, bonus turn
  [5, 5], // second double, another bonus turn
  [1, 1], // third double: jail
  [6, 2],
  [1, 3], // (two players) the prisoner fails an attempt
  [4, 5],
  [3, 3], // (two players) the prisoner leaves on a double
  [2, 5],
  [6, 4],
  [1, 2],
  [5, 3],
  [4, 4],
  [2, 6],
  [3, 1],
  [5, 6],
];

/** How long a mock-played seat waits before acting, so animations can be watched. */
export const BOT_DELAY_MS = 1600;
/** How long after a human enters a room the mock fills or starts it. */
export const LOBBY_BOT_DELAY_MS = 2000;

/**
 * `MOCK_SCENARIO=stage4`: order dice that put the room creator first, then
 * turn dice for rent and building with the seeded owners below.
 */
export const STAGE4_ORDER_DICE: readonly number[] = [6, 2];

/** Seat 0 (the creator) and seat 1 own these cells; houses by cell index. */
export const STAGE4_SEED = {
  owners: [
    [1, 3, 6, 8, 9, 12], // M1 complete without houses, M2 complete with uneven-ready houses, an energy asset
    [5, 15, 11, 28], // two logistics, one M3 asset (incomplete group), an energy asset
  ],
  houses: { 6: 1, 8: 1 } as Readonly<Record<number, number>>,
} as const;

export const STAGE4_TURN_DICE: readonly (readonly [number, number])[] = [
  [2, 3], // creator 0 -> 5: logistics of seat 1, two holdings: rent to pay
  [1, 2], // seat 1 0 -> 3: creator's complete M1 group, doubled rent, auto-paid at EndTurn
  [2, 4], // creator 5 -> 11: seat 1's M3 asset, regular rent
  [4, 5], // seat 1 3 -> 12: creator's energy asset, dice sum 9
  [1, 3],
  [2, 5],
  [3, 6],
  [1, 4],
];
