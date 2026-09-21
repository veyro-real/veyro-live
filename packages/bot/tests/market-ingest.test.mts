import test from 'node:test';import assert from 'node:assert/strict';
const {handleFeedMessage,SUBSCRIPTIONS}=await import('../src/market/ingest');
import type {IngestDeps} from '../src/market/ingest';

const MINT='Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';
const create={
 mint:MINT,traderPublicKey:'Creator111',txType:'create',solAmount:2.5,
 vSolInBondingCurve:32.5,marketCapSol:41.2,name:'dogwifhat',symbol:'WIF',
 uri:'https://ipfs.io/x',pool:'pump',
};

function harness(over:Partial<IngestDeps>={}){
 const recorded:string[]=[];const assessed:{mint:string;liquiditySol:number|null}[]=[];
 const deps:IngestDeps={
  recordCandidate:async c=>{recorded.push(c.mint);},
  assessAndRecord:async(c,liquiditySol)=>{assessed.push({mint:c.mint,liquiditySol});},
  onError:()=>{},
  onTrade:()=>{},
  ...over,
 };
 return {deps,recorded,assessed};
}

test('we subscribe to launches and migrations, nothing else',()=>{
 const methods=SUBSCRIPTIONS.map(s=>s.method);
 assert.deepEqual(methods,['subscribeNewToken','subscribeMigration']);
});

test('a launch is recorded and then assessed',async()=>{
 const h=harness();
 await handleFeedMessage(JSON.stringify(create),h.deps);
 assert.deepEqual(h.recorded,[MINT]);
 assert.deepEqual(h.assessed,[{mint:MINT,liquiditySol:32.5}]);
});

test('liquidity from the feed reaches the assessment rather than being lost',async()=>{
 const h=harness();
 await handleFeedMessage(JSON.stringify({...create,vSolInBondingCurve:7.25}),h.deps);
 assert.equal(h.assessed[0].liquiditySol,7.25);
});

test('it records before it assesses, so a crash still leaves the candidate',async()=>{
 const order:string[]=[];
 const h=harness({
  recordCandidate:async()=>{order.push('record');},
  assessAndRecord:async()=>{order.push('assess');},
 });
 await handleFeedMessage(JSON.stringify(create),h.deps);
 assert.deepEqual(order,['record','assess']);
});

test('a failed assessment leaves the candidate stored for a later pass',async()=>{
 const h=harness({assessAndRecord:async()=>{throw Error('429');}});
 await handleFeedMessage(JSON.stringify(create),h.deps);
 assert.deepEqual(h.recorded,[MINT],'the candidate survives a measurement failure');
});

test('a failure is reported rather than swallowed silently',async()=>{
 const errors:string[]=[];
 const h=harness({assessAndRecord:async()=>{throw Error('429');},onError:e=>errors.push(String(e))});
 await handleFeedMessage(JSON.stringify(create),h.deps);
 assert.equal(errors.length,1);
 assert.match(errors[0],/429/);
});

test('migrations, acknowledgements and malformed frames do nothing',async()=>{
 const h=harness();
 for(const frame of [
  JSON.stringify({...create,txType:'migrate'}),
  JSON.stringify({message:'Successfully subscribed'}),
  'not json at all',
  '',
 ]) await handleFeedMessage(frame,h.deps);
 assert.deepEqual(h.recorded,[]);
 assert.deepEqual(h.assessed,[]);
});

test('one bad frame does not stop the next good one',async()=>{
 const h=harness();
 await handleFeedMessage('garbage',h.deps);
 await handleFeedMessage(JSON.stringify(create),h.deps);
 assert.deepEqual(h.recorded,[MINT]);
});

test('the bonding curve address reaches the assessment',async()=>{
 const seen:(string|null)[]=[];
 const h=harness({assessAndRecord:async(_c,_l,curve)=>{seen.push(curve);}});
 await handleFeedMessage(JSON.stringify({...create,bondingCurveKey:'BC1'}),h.deps);
 assert.deepEqual(seen,['BC1']);
});

const tradeFrame={
 signature:'s',mint:MINT,traderPublicKey:'Buyer1',txType:'buy',
 tokenAmount:1000,solAmount:0.35,vSolInBondingCurve:34.2,marketCapSol:43.1,pool:'pump',
};

test('a trade frame reaches the observer, not the candidate table',async()=>{
 const seen:any[]=[];
 const h=harness({onTrade:t=>{seen.push(t);}});
 await handleFeedMessage(JSON.stringify(tradeFrame),h.deps);
 assert.equal(seen.length,1);
 assert.equal(seen[0].trader,'Buyer1');
 assert.equal(seen[0].side,'buy');
 assert.deepEqual(h.recorded,[],'a trade is not a new candidate');
 assert.deepEqual(h.assessed,[],'and it does not trigger an assessment');
});

test('a launch is still a launch, not a trade',async()=>{
 const seen:any[]=[];
 const h=harness({onTrade:t=>{seen.push(t);}});
 await handleFeedMessage(JSON.stringify(create),h.deps);
 assert.equal(seen.length,0);
 assert.deepEqual(h.recorded,[MINT]);
});

test('a throwing trade handler does not kill the socket loop',async()=>{
 const errors:string[]=[];
 const h=harness({onTrade:()=>{throw Error('boom');},onError:e=>errors.push(String(e))});
 await handleFeedMessage(JSON.stringify(tradeFrame),h.deps);
 assert.equal(errors.length,1);
});
