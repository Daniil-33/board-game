import { expect, it, vi } from 'vitest';
vi.mock('../rent.js', async importOriginal => ({...await importOriginal<typeof import('../rent.js')>(), isMortgaged: () => true}));
import { buildLegality } from '../houses.js';
import { playingGame } from './helpers/game.js';
import { pid } from './helpers/fixtures.js';
it('rejects building when any group mortgage hook reports a mortgage',()=>{
  const s=playingGame(['a','b']).state;
  const members=s.board!.cells.filter(c=>c.asset?.groupId==='M1');
  const state={...s,owners:Object.fromEntries(members.map(c=>[c.asset!.assetId,pid('a')]))};
  expect(buildLegality(state,pid('a'),members[0]!.asset!.assetId)).toBe('GROUP_MORTGAGED');
});
