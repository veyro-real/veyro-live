import test from 'node:test';import assert from 'node:assert/strict';
const {settleWatch,createDrainer}=await import('../src/market/settle');
const {createObserver}=await import('../src/market/observer');
import type {SettleDeps} from '../src/market/settle';
import type {Candidate} from '../src/types';
import type {Trade} from '../src/market/trades';

const T0=1_000_000_000_000;
const MINT='M1';
const cand=(mint=MINT):Candidate=>({
 mint,symbol:'WIF',name:'dogwifhat',launchpad:'pump.fun',creator:'dev',
 firstSeen:new Date(T0).toISOString(),initialBuySol:1,marketCapSol:30,uri:'ipfs://x',
});
const trade=(o:Partial<Trade>&{trader:string;at:number}):Trade=>({
 mint:MINT,side:'buy',solAmount:0.5,tokenAmount:100,curveSol:31,marketCapSol:40,...o,
});
const watch=(trades:Trade[]=[],o:Partial<any>={})=>({
 candidate:cand(),windowStart:T0,windowEnd:T0+30_000,trades,
 liquiditySol:28,bondingCurveKey:'CURVE',...o,
});

function deps(over:Partial<SettleDeps>={}){
 const recorded:{mint:string;payload:any}[]=[];
 const unwatched:string[]=[];const errors:unknown[]=[];
 const d:SettleDeps={
  readFacts:async()=>({mintAuthorityRevoked:true,freezeAuthorityRevoked:true,top10Pct:20,floatHolders:30}),
  record:async(mint,payload)=>{recorded.push({mint,payload});},
  unwatch:m=>{unwatched.push(m);},
  onError:(_m,e)=>{errors.push(e);},
  ...over,
 };
 return {d,recorded,unwatched,errors};
}

test('settling measures the flow and records an assessment',async()=>{
 const {d,recorded}=deps();
 const a=await settleWatch(watch([
  trade({trader:'a',at:T0+1000}),
  trade({trader:'b',at:T0+2000}),
  trade({trader:'c',at:T0+3000,side:'sell',solAmount:0.2}),
 ]),d);
 assert.ok(a);
 assert.equal(recorded.length,1);
 assert.equal(recorded[0].mint,MINT);
 assert.equal(recorded[0].payload.flow.uniqueBuyers,2);
 assert.equal(recorded[0].payload.flow.sells,1);
});

test('observed flow reaches the features the filter reads',async()=>{
 const {d,recorded}=deps();
 await settleWatch(watch([trade({trader:'a',at:T0+1000}),trade({trader:'b',at:T0+2000})]),d);
 const f=recorded[0].payload.features;
 assert.equal(f.buyCount,2);
 assert.equal(f.uniqueBuyers,2);
});

test('creator flow is measured against the launch creator',async()=>{
 const {d,recorded}=deps();
 await settleWatch(watch([
  trade({trader:'dev',at:T0+1000,solAmount:2}),
  trade({trader:'dev',at:T0+2000,solAmount:5,side:'sell'}),
 ]),d);
 assert.equal(recorded[0].payload.flow.creatorNetSol,-3,'dev selling is the hard tell');
});

test('the newest curve reading wins over the launch snapshot',async()=>{
 const {d,recorded}=deps();
 await settleWatch(watch([trade({trader:'a',at:T0+1000,curveSol:44.5})]),d);
 assert.equal(recorded[0].payload.features.liquiditySol,44.5);
});

test('with no trades it falls back to the value from the launch',async()=>{
 const {d,recorded}=deps();
 await settleWatch(watch([]),d);
 assert.equal(recorded[0].payload.features.liquiditySol,28);
});

test('the curve key is handed to the facts read so it can be excluded',async()=>{
 const seen:(string|null)[]=[];
 const {d}=deps({readFacts:async(_m,curve)=>{seen.push(curve);
  return {mintAuthorityRevoked:true,freezeAuthorityRevoked:true,top10Pct:10,floatHolders:20};}});
 await settleWatch(watch(),d);
 assert.deepEqual(seen,['CURVE']);
});

test('a failed facts read still unsubscribes and reports, never silently leaks',async()=>{
 const {d,unwatched,errors,recorded}=deps({readFacts:async()=>{throw Error('429');}});
 const a=await settleWatch(watch(),d);
 assert.equal(a,null);
 assert.deepEqual(unwatched,[MINT],'the stream must be closed either way');
 assert.equal(errors.length,1);
 assert.equal(recorded.length,0);
});

test('a failed write is reported rather than thrown at the socket loop',async()=>{
 const {d,unwatched,errors}=deps({record:async()=>{throw Error('db down');}});
 assert.equal(await settleWatch(watch(),d),null);
 assert.deepEqual(unwatched,[MINT]);
 assert.equal(errors.length,1);
});

test('draining settles every due watch and leaves the rest alone',async()=>{
 const o=createObserver({windowMs:30_000});
 o.open(cand('A'),T0);o.open(cand('B'),T0);o.open(cand('C'),T0+60_000);
 const {d,recorded}=deps();
 const n=await createDrainer(o,d,{gapMs:0}).run(T0+31_000);
 assert.equal(n,2);
 assert.deepEqual(recorded.map(r=>r.mint).sort(),['A','B']);
 assert.deepEqual(o.watching(),['C'],'the open window keeps running');
});

test('a drain in progress is not started again underneath itself',async()=>{
 const o=createObserver({windowMs:30_000});
 o.open(cand('A'),T0);o.open(cand('B'),T0);
 let concurrent=0,peak=0;
 const {d}=deps({readFacts:async()=>{
  concurrent++;peak=Math.max(peak,concurrent);
  await new Promise(r=>setTimeout(r,20));concurrent--;
  return {mintAuthorityRevoked:true,freezeAuthorityRevoked:true,top10Pct:10,floatHolders:20};
 }});
 const drainer=createDrainer(o,d,{gapMs:0});
 const [a,b]=await Promise.all([drainer.run(T0+31_000),drainer.run(T0+31_000)]);
 assert.equal(peak,1,'settles run one at a time, to respect the RPC');
 assert.equal(a+b,2,'and each watch is settled exactly once');
});
