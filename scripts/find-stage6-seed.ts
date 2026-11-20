import { createSession, entropy, gameEngine, type GameCommand, type GameEvent } from '../packages/game-core/src/index.ts';

const FIRST_SEED = Number(process.argv[2] ?? 0);
const LAST_SEED = Number(process.argv[3] ?? 200_000);
const T0 = 1_767_225_600_000;

/** Same deterministic host entropy stream used by docker-compose.e2e.yml. */
function entropySource(seed: number) {
  let state=seed>>>0;
  const word=()=>{state=(state+0x9e3779b9)>>>0;let z=state;z=Math.imul(z^(z>>>16),0x85ebca6b);z=Math.imul(z^(z>>>13),0xc2b2ae35);return(z^(z>>>16))>>>0;};
  return ()=>entropy([word(),word(),word(),word()]);
}

interface RecordedRoll { player:string; dice:number[]; events:string[] }
interface RecordedSetupRoll { player:string; value:number; events:string[] }

function candidate(seed:number):{setupRolls:RecordedSetupRoll[];rolls:RecordedRoll[];events:string[]}|null {
  const session=createSession(gameEngine),nextEntropy=entropySource(seed),rolls:RecordedRoll[]=[],setupTrace:RecordedSetupRoll[]=[],allEvents:GameEvent[]=[];
  let now=T0,serial=0,setupRolls=0,sawTie=false;
  const submit=(type:string,payload:unknown=null,actor?:string)=>{
    const state=session.state;
    const selectedTarget=state.setup?{kind:'setupRoll',id:state.setup.setupRollId}:state.auction?{kind:'auctionResponse',id:state.auction.responseId}:{kind:'turn',id:state.turn?.turnId??''};
    const selectedActor=actor??(state.setup?.playerId??state.auction?.responder??state.turn?.playerId);
    const command:GameCommand={type,commandId:`seed-search-${seed}-${serial++}` as never,
      actor:selectedActor?{kind:'player',id:selectedActor as never}:{kind:'system'},
      expected:state.phase==='uninitialized'||state.phase==='lobby'?{kind:'revision',revision:state.revision}:{kind:'target',target:selectedTarget},payload};
    const result=session.submit(command,{now:now++ as never,entropy:nextEntropy()});
    if(result.kind!=='accepted')throw new Error(`seed ${seed}: ${type} rejected: ${result.error.code}`);
    allEvents.push(...result.events);
    if(type==='RollForOrder'){
      setupRolls++;
      const die=result.events.find(e=>e.type==='OrderDieRolled')?.payload as {value?:number}|undefined;
      if(die)setupTrace.push({player:selectedActor??'?',value:die.value??0,events:result.events.map(e=>e.type)});
    }
    if(result.events.some(e=>e.type==='OrderTied'))sawTie=true;
    if(type==='RollDice'){
      const dice=(result.events.find(e=>e.type==='DiceRolled')?.payload as {dice?:number[]}|undefined)?.dice;
      rolls.push({player:command.actor.kind==='player'?command.actor.id:'?',dice:dice?[...dice]:[],events:result.events.map(e=>e.type)});
    }
    return result.events;
  };
  try {
    submit('CreateGame',{seed,rulesVersion:'core-9'});
    submit('AddPlayer',{playerId:'a'});
    submit('AddPlayer',{playerId:'b'});
    submit('StartGame');
    while(session.state.setup)submit('RollForOrder');
    if(setupRolls!==4||!sawTie)return null;

    let jailIndex=-1;
    for(let i=0;i<8&&jailIndex<0;i++){
      const events=submit('RollDice');
      if(events.some(e=>e.type==='SentToJail'))jailIndex=rolls.length-1;
      else if(session.state.purchase)submit('StartAuction');
      if(session.state.auction){while(session.state.auction)submit('PassAuction',null,session.state.auction.responder);}
      if(jailIndex<0&&session.state.turn?.rolled)submit('EndTurn');
    }
    if(jailIndex<2)return null;
    const jailed=rolls.slice(jailIndex-2,jailIndex);
    if(jailed.some(r=>r.player!==rolls[jailIndex]!.player||r.dice[0]!==r.dice[1])||rolls[jailIndex]!.dice[0]!==rolls[jailIndex]!.dice[1])return null;
    if(!rolls[jailIndex]!.events.includes('SentToJail'))return null;

    const prisoner=rolls[jailIndex]!.player;
    let firstAttempt=false;
    for(let actions=0;actions<160&&!firstAttempt;actions++){
      const state=session.state;
      if(state.phase!=='playing'||!state.turn)return null;
      if(Object.hasOwn(state.jail,state.turn.playerId)&&state.turn.playerId===prisoner){
        const events=submit('RollDice');
        firstAttempt=events.some(e=>e.type==='JailAttemptFailed');
        if(!firstAttempt)return null;
      } else if(state.auction){submit('PassAuction',null,state.auction.responder);}
      else if(state.purchase){submit('StartAuction',null,state.turn.playerId);while(session.state.auction)submit('PassAuction',null,session.state.auction.responder);}
      else if(!state.turn.rolled){submit('RollDice',null,state.turn.playerId);}
      else submit('EndTurn',null,state.turn.playerId);
    }
    if(!firstAttempt)return null;

    let crossed=false;
    for(let actions=0;actions<240&&!crossed;actions++){
      const state=session.state;
      if(state.phase!=='playing'||!state.turn)return null;
      let events:readonly GameEvent[]=[];
      if(state.auction)events=submit('PassAuction',null,state.auction.responder);
      else if(state.purchase){events=submit('StartAuction',null,state.turn.playerId);while(session.state.auction)submit('PassAuction',null,session.state.auction.responder);}
      else if(!state.turn.rolled)events=submit('RollDice',null,state.turn.playerId);
      else events=submit('EndTurn',null,state.turn.playerId);
      if(events.some(e=>e.type==='BalanceChanged'&&(e.payload as {reason?:string}).reason==='lap-reward'))crossed=true;
    }
    return crossed?{setupRolls:setupTrace,rolls,events:allEvents.map(e=>e.type)}:null;
  } catch {return null;}
}

for(let seed=FIRST_SEED;seed<=LAST_SEED;seed++){
  const result=candidate(seed);
  if(result){console.log(JSON.stringify({seed,criteria:{twoPlayers:true,setupRolls:4,setupTie:true,threeDoublesBeforeMovement:true,firstJailAttemptFailed:true,lapRewardCrossing:true,actionBudgets:{jailAttempt:160,lapCrossing:240}},setupRolls:result.setupRolls,rolls:result.rolls,events:result.events},null,2));process.exit(0);}
}
console.error(`No matching seed in [${FIRST_SEED}, ${LAST_SEED}]`);
process.exit(1);
