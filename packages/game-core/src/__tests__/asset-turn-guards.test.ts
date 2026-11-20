import { describe, expect, it } from 'vitest';
import { gameEngine, mortgageAdvance, type GameCommand, type GameState } from '../index.js';
import { playingGame } from './helpers/game.js';
import { cmd, ctx, pid, player } from './helpers/fixtures.js';

const by = (state: GameState, type: string, assetId: string, actor: string): GameCommand =>
  cmd(type, { assetId }, { actor: player(actor), target: { kind: 'turn', id: state.turn!.turnId } });
const rejectCode = (state: GameState, command: GameCommand) => {
  const result = gameEngine.execute(state, command, ctx());
  expect(result.kind === 'rejected' && result.error.code).toBe('NOT_ACTIVE_PLAYER');
};

describe('C13 asset actions belong to the turn owner', () => {
  it('rejects off-turn build, sale, mortgage and redeem during another player’s open rent', () => {
    const state = playingGame(['a', 'b', 'c']).state;
    const cells = state.board!.cells.filter(c => c.asset?.groupId === 'M2');
    const assets = cells.map(c => c.asset!);
    const mortgageAsset = state.board!.cells.find(c => c.kind === 'monopoly' && c.asset?.groupId !== 'M2')!.asset!;
    const owners = Object.fromEntries([...assets, mortgageAsset].map(a => [a.assetId, pid('b')]));
    const houses = Object.fromEntries(assets.map(a => [a.assetId, 1]));
    const mortgage = { advance: mortgageAdvance(mortgageAsset.price), lapsCompleted: 0, pending: [...state.order!], lockedTurnId: null };
    const due: GameState = {
      ...state, owners, houses,
      mortgages: { [mortgageAsset.assetId]: mortgage },
      positions: { ...state.positions, a: cells[0]!.index },
      turn: { ...state.turn!, rolled: true },
      rent: { payerId: pid('a'), ownerId: pid('b'), assetId: assets[0]!.assetId, cell: cells[0]!.index,
        kind: 'regular', amount: 100 as never, diceSum: null },
    };
    rejectCode(due, by(due, 'BuildHouse', assets[0]!.assetId, 'b'));
    rejectCode(due, by(due, 'SellHouse', assets[0]!.assetId, 'b'));
    rejectCode(due, by(due, 'Mortgage', mortgageAsset.assetId, 'b'));
    rejectCode(due, by(due, 'Redeem', mortgageAsset.assetId, 'b'));
  });

  it('keeps AUCTION_IN_PROGRESS ahead of turn ownership', () => {
    const game = playingGame(['a', 'b', 'c']);
    game.roll(1, 2); // property acquisition at cell 3
    const startAuction = cmd('StartAuction', null, { actor: player('a'), target: { kind: 'turn', id: game.state.turn!.turnId } });
    const start = game.session.submit(startAuction, ctx());
    expect(start.kind).toBe('accepted');
    const state = game.state;
    const result = gameEngine.execute(state, by(state, 'Mortgage', game.state.board!.cells[1]!.asset!.assetId, 'b'), ctx());
    expect(result.kind === 'rejected' && result.error.code).toBe('AUCTION_IN_PROGRESS');
  });
});
