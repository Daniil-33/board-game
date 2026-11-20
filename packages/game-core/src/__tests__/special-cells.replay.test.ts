import {describe,it,expect} from 'vitest';
import {createSession,replay,type Session} from '../session.js';
import {gameEngine} from '../rules.js';
import {entropy,type GameCommand} from '../index.js';
import {cmd,ctx,player} from './helpers/fixtures.js';
import {CURRENT_RULES_VERSION} from '../lifecycle.js';

function trace():Session {
  const seed=0,s=createSession(gameEngine);
  let entropyState=seed>>>0,now=1_767_225_600_000,serial=0;
  const word=()=>{entropyState=(entropyState+0x9e3779b9)>>>0;let z=entropyState;z=Math.imul(z^(z>>>16),0x85ebca6b);z=Math.imul(z^(z>>>13),0xc2b2ae35);return(z^(z>>>16))>>>0;};
  const nextEntropy=()=>entropy([word(),word(),word(),word()]);
  const submit=(type:string,payload:unknown=null,actor?:string)=>{
    const state=s.state;
    const target=state.setup?{kind:'setupRoll',id:state.setup.setupRollId}:state.auction?{kind:'auctionResponse',id:state.auction.responseId}:{kind:'turn',id:state.turn?.turnId??''};
    const selected=actor??state.setup?.playerId??state.auction?.responder??state.turn?.playerId;
    const command:GameCommand={type,commandId:`replay-${seed}-${serial++}` as never,actor:selected?{kind:'player',id:selected as never}:{kind:'system'},expected:state.phase==='lobby'||state.phase==='uninitialized'?{kind:'revision',revision:state.revision}:{kind:'target',target},payload};
    const result=s.submit(command,{now:now++ as never,entropy:nextEntropy()});
    if(result.kind!=='accepted')throw new Error(`${type}: ${result.error.code}`);
    return result.events;
  };
  submit('CreateGame',{seed,rulesVersion:CURRENT_RULES_VERSION});
  submit('AddPlayer',{playerId:'a'});submit('AddPlayer',{playerId:'b'});submit('StartGame');
  for(let i=0;i<1800&&(s.state.phase==='setup'||s.state.phase==='playing');i++){
    const state=s.state;
    if(state.setup){submit('RollForOrder');continue;}
    if(state.auction){submit('PassAuction',null,state.auction.responder);continue;}
    if(state.casino&&!s.log.some(entry=>entry.events.some(event=>event.type==='CasinoResolved'))){submit('PlaceCasinoBet',{amount:10},state.turn!.playerId);continue;}
    if(state.purchase){submit('StartAuction',null,state.turn!.playerId);continue;}
    if(state.rent){submit('PayRent',null,state.turn!.playerId);continue;}
    if(state.charge){submit('PayCharge',null,state.turn!.playerId);continue;}
    if(state.turn!.rolled){submit('EndTurn',null,state.turn!.playerId);continue;}
    submit('RollDice',null,state.turn!.playerId);
    const observed=new Set(s.log.flatMap(entry=>entry.events.map(event=>event.type)));
    if(['CasinoOffered','CasinoResolved','CasinoDeclined','ChanceDrawn','JailAttemptFailed','JailReleased'].every(type=>observed.has(type)))return s;
  }
  throw new Error('seed 0 did not produce every special-cell event within 1800 commands');
}

describe('special-cell replay',()=>{
  it('reproduces a deterministic log containing every new special-cell event',()=>{
    const original=trace();
    const events=original.log.flatMap(entry=>entry.events);
    const required=['CasinoOffered','CasinoResolved','CasinoDeclined','ChanceDrawn','JailAttemptFailed','JailReleased'];
    for(const type of required)expect(events.some(event=>event.type===type),type).toBe(true);
    const replayed=replay(gameEngine,original.log);
    expect(replayed.state).toEqual(original.state);
    expect(replayed.log.map(entry=>entry.events)).toEqual(original.log.map(entry=>entry.events));
  });
});
