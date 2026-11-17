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

/**
 * `MOCK_SCENARIO=stage5`: three seats in join order (the creator, Bot Ada,
 * Bot Ben). The order dice keep that order; the seed below and the turn dice
 * play out, through game-core: the creator's own mortgage (Mortgage/Redeem on
 * the asset card), Ben's tiered liquidation to Ada, the expiry of Ada's
 * mortgage at the end of the first lap, the creator's bankruptcy (watching
 * afterwards), then Ben's bankruptcy, which ends the game with Ada winning.
 */
export const STAGE5_ORDER_DICE: readonly number[] = [6, 4, 2];

/** Per seat: cash, position, owned cells, houses and mortgaged cells (laps already completed). */
export const STAGE5_SEED: readonly {
  readonly cash: number;
  readonly position: number;
  readonly owners: readonly number[];
  readonly houses: Readonly<Record<number, number>>;
  readonly mortgages: Readonly<Record<number, number>>;
}[] = [
  // Creator: M1 complete, energy 12 mortgaged with the whole term ahead; total value too small for Ada's 29.
  { cash: 1000, position: 15, owners: [1, 3, 12], houses: {}, mortgages: { 12: 0 } },
  // Ada: M6 and M8 with 4 houses each; logistics 35 mortgaged, expiring at the end of this lap.
  { cash: 5000, position: 0, owners: [26, 27, 29, 35, 37, 39], houses: { 26: 4, 27: 4, 29: 4, 37: 4, 39: 4 }, mortgages: { 35: 7 } },
  // Ben: tier 1 (M4 asset 16), tier 2 (M2 complete) and tier 3 (M3 with one house each).
  { cash: 100, position: 20, owners: [16, 6, 8, 9, 11, 13, 14], houses: { 11: 1, 13: 1, 14: 1 }, mortgages: {} },
];

export const STAGE5_TURN_DICE: readonly (readonly [number, number])[] = [
  [3, 4], // creator 15 -> 22: nothing due; mortgage M1 or redeem 12 before or after rolling
  [3, 4], // Ada 0 -> 7: nothing due
  [4, 5], // Ben 20 -> 29: Ada's rent 2870, liquidation in all tiers; the lap ends and Ada's mortgage expires
  [2, 5], // creator 22 -> 29: Ada's rent 2870 exceeds everything the creator has: bankrupt, watching
  [4, 6], // Ada 7 -> 17: nothing due
  [3, 5], // Ben 29 -> 37: Ada's rent 4360: bankrupt, Ada wins
  [1, 2],
  [2, 3],
];
