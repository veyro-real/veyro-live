import test from 'node:test';import assert from 'node:assert/strict';
const {createObserver}=await import('../lib/market/observer');
import type {Trade} from '../lib/market/trades';
import type {Candidate} from '../lib/types';

const T0=1_000_000_000_000;
const cand=(mint:string):Candidate=>({
 mint,symbol:'S',name:'n',launchpad:'pump.fun',creator:'dev',
 firstSeen:new Date(T0).toISOString(),initialBuySol:1,marketCapSol:30,uri:null,
});
const trade=(mint:string,at:number,trader='a'):Trade=>({
 mint,trader,side:'buy',solAmount:0.1,tokenAmount:1,curveSol:30,marketCapSol:40,at,
});

test('opening a watch asks for that token trade stream',()=>{
 const o=createObserver({windowMs:30_000});
 assert.equal(o.open(cand('M1'),T0),true);
 assert.deepEqual(o.watching(),['M1']);
});

test('opening the same token twice does not double subscribe',()=>{
 const o=createObserver({windowMs:30_000});
 o.open(cand('M1'),T0);
 assert.equal(o.open(cand('M1'),T0+100),false);
 assert.deepEqual(o.watching(),['M1']);
});

test('trades are kept only for tokens being watched',()=>{
 const o=createObserver({windowMs:30_000});
 o.open(cand('M1'),T0);
 assert.equal(o.record(trade('M1',T0+1000)),true);
 assert.equal(o.record(trade('UNWATCHED',T0+1000)),false,'no unbounded memory for random mints');
});

test('a window is not due until it has elapsed',()=>{
 const o=createObserver({windowMs:30_000});
 o.open(cand('M1'),T0);
 assert.deepEqual(o.due(T0+29_999),[]);
 assert.deepEqual(o.due(T0+30_001).map(w=>w.candidate.mint),['M1']);
});

test('closing returns everything observed and stops the watch',()=>{
 const o=createObserver({windowMs:30_000});
 o.open(cand('M1'),T0);
 o.record(trade('M1',T0+1000,'a'));
 o.record(trade('M1',T0+2000,'b'));
 const done=o.close('M1')!;
 assert.equal(done.trades.length,2);
 assert.equal(done.windowStart,T0);
 assert.equal(done.windowEnd,T0+30_000);
 assert.deepEqual(o.watching(),[]);
 assert.equal(o.close('M1'),null,'closing twice is harmless');
});

test('capacity is bounded and the oldest watch is dropped first',()=>{
 const o=createObserver({windowMs:30_000,maxWatched:2});
 o.open(cand('M1'),T0);
 o.open(cand('M2'),T0+1000);
 o.open(cand('M3'),T0+2000);
 assert.deepEqual(o.watching(),['M2','M3'],'M1 evicted');
});

test('a single token cannot exhaust memory with trades',()=>{
 const o=createObserver({windowMs:30_000,maxTradesPerToken:3});
 o.open(cand('M1'),T0);
 for(let i=0;i<10;i++)o.record(trade('M1',T0+i*100));
 assert.equal(o.close('M1')!.trades.length,3);
});

test('evicting a watch also stops its stream',()=>{
 const o=createObserver({windowMs:30_000,maxWatched:1});
 o.open(cand('M1'),T0);
 const evicted=o.open(cand('M2'),T0+1000);
 assert.equal(evicted,true);
 assert.equal(o.record(trade('M1',T0+2000)),false,'the dropped token is no longer tracked');
});
