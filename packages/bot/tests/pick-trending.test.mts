import test from 'node:test';import assert from 'node:assert/strict';
import {pickTrending,TRENDING_POOL} from '../src/trade/pick-trending';

const row=(mint:string)=>({mint,symbol:mint.toUpperCase()} as never);
const rows=['a','b','c','d','e'].map(row);

test('it picks from the pool, not always the loudest',()=>{
 const seen=new Set<string>();
 for(let i=0;i<rows.length;i++){
  const p=pickTrending(rows,[],()=>i/rows.length);
  if(p)seen.add(p.mint);
 }
 assert.ok(seen.size>1,'every pick returned the same token');
});

// Buying what you already hold is refused by POSITION_ALREADY_OPEN, so
// picking it is a guaranteed dead end.
test('a token already held is never picked',()=>{
 for(let i=0;i<20;i++){
  const p=pickTrending(rows,['a','b','c','d'],()=>Math.random());
  assert.equal(p?.mint,'e','picked something already held');
 }
});

test('everything held means nothing to pick, not a bad pick',()=>{
 assert.equal(pickTrending(rows,['a','b','c','d','e'],()=>0),null);
 assert.equal(pickTrending([],[],()=>0),null);
});

test('the pool is wide enough to vary and short enough to stay loud',()=>{
 assert.ok(TRENDING_POOL>=5&&TRENDING_POOL<=25,`pool of ${TRENDING_POOL}`);
});

test('a random source at its extremes still returns a real row',()=>{
 for(const r of [0,0.999999]){
  const p=pickTrending(rows,[],()=>r);
  assert.ok(p&&rows.some(x=>x.mint===p.mint),`rng ${r} produced ${JSON.stringify(p)}`);
 }
});
