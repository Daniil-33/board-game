import { expect, it } from 'vitest';
import { buildLegality } from '../houses.js';
import { mortgageAdvance } from '../mortgage.js';
import { playingGame } from './helpers/game.js';
import { pid } from './helpers/fixtures.js';
it('rejects building when any group asset has a persisted mortgage',()=>{
  const s=playingGame(['a','b']).state;
  const members=s.board!.cells.filter(c=>c.asset?.groupId==='M1');
  const mortgaged=members[1]!.asset!;
  const state={...s,owners:Object.fromEntries(members.map(c=>[c.asset!.assetId,pid('a')])),mortgages:{[mortgaged.assetId]:{advance:mortgageAdvance(mortgaged.price),lapsCompleted:0,pending:s.order!}}};
  expect(buildLegality(state,pid('a'),members[0]!.asset!.assetId)).toBe('GROUP_MORTGAGED');
});
