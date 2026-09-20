import test from 'node:test';import assert from 'node:assert/strict';
const {decideExit,NO_EXIT_RULES}=await import('../lib/trade/exit');
import type {ExitRules} from '../lib/trade/exit';

const SOL=1_000_000_000n;
const base=(o:Partial<Parameters<typeof decideExit>[0]>={})=>({
 entryLamports:SOL,
 currentLamports:SOL,
 peakLamports:SOL,
 openedAt:new Date(Date.now()-60_000).toISOString(),
 now:Date.now(),
 rules:NO_EXIT_RULES as ExitRules,
 ...o,
});

test('with no rules a position is never sold automatically',()=>{
 assert.deepEqual(decideExit(base({currentLamports:SOL*10n})),{sell:false});
 assert.deepEqual(decideExit(base({currentLamports:1n})),{sell:false});
});

test('take profit fires at the threshold, not before',()=>{
 const rules={...NO_EXIT_RULES,takeProfitPct:50};
 assert.deepEqual(decideExit(base({rules,currentLamports:1_400_000_000n})),{sell:false});
 assert.deepEqual(decideExit(base({rules,currentLamports:1_500_000_000n})),{sell:true,reason:'TAKE_PROFIT'});
});

test('stop loss fires on the way down',()=>{
 const rules={...NO_EXIT_RULES,stopLossPct:30};
 assert.deepEqual(decideExit(base({rules,currentLamports:750_000_000n})),{sell:false});
 assert.deepEqual(decideExit(base({rules,currentLamports:700_000_000n})),{sell:true,reason:'STOP_LOSS'});
});

test('a stop loss outranks a take profit when rules are contradictory',()=>{
 const rules={...NO_EXIT_RULES,takeProfitPct:1,stopLossPct:1};
 assert.deepEqual(decideExit(base({rules,currentLamports:500_000_000n})),{sell:true,reason:'STOP_LOSS'});
});

test('a trailing stop measures from the peak, not from entry',()=>{
 const rules={...NO_EXIT_RULES,trailingPct:20};
 // Tripled, then gave back 10%: still holding.
 assert.deepEqual(decideExit(base({rules,peakLamports:SOL*3n,currentLamports:2_700_000_000n})),{sell:false});
 // Gave back 20% of the peak: out, even though it is still up on entry.
 assert.deepEqual(decideExit(base({rules,peakLamports:SOL*3n,currentLamports:2_400_000_000n})),
  {sell:true,reason:'TRAILING_STOP'});
});

test('a maximum hold closes a position on time alone',()=>{
 const rules={...NO_EXIT_RULES,maxHoldSeconds:300};
 const now=Date.now();
 assert.deepEqual(decideExit(base({rules,now,openedAt:new Date(now-299_000).toISOString()})),{sell:false});
 assert.deepEqual(decideExit(base({rules,now,openedAt:new Date(now-301_000).toISOString()})),
  {sell:true,reason:'MAX_HOLD'});
});

test('an unpriceable position is never sold on a guess',()=>{
 const rules={...NO_EXIT_RULES,stopLossPct:10};
 assert.deepEqual(decideExit(base({rules,currentLamports:0n})),{sell:false},
  'a failed quote is not the same as a price of zero');
});

test('a position with no entry basis cannot be judged',()=>{
 const rules={...NO_EXIT_RULES,takeProfitPct:10};
 assert.deepEqual(decideExit(base({rules,entryLamports:0n,currentLamports:SOL})),{sell:false});
});

test('the peak is never below entry, so trailing cannot fire instantly',()=>{
 const rules={...NO_EXIT_RULES,trailingPct:10};
 assert.deepEqual(decideExit(base({rules,peakLamports:0n,currentLamports:SOL})),{sell:false});
});

test('time beats profit when both apply, because the clock is certain',()=>{
 const now=Date.now();
 const rules={...NO_EXIT_RULES,takeProfitPct:1000,maxHoldSeconds:60};
 const d=decideExit(base({rules,now,openedAt:new Date(now-120_000).toISOString(),currentLamports:SOL*2n}));
 assert.deepEqual(d,{sell:true,reason:'MAX_HOLD'});
});

test('take profit is measured net of the round trip, not gross',()=>{
 // 3.5% round trip: a +4% gross move is +0.5% net and must not satisfy +4%.
 const rules={...NO_EXIT_RULES,takeProfitPct:4};
 const costed=base({rules,roundTripCostPct:3.5,currentLamports:1_040_000_000n});
 assert.deepEqual(decideExit(costed),{sell:false},'gross +4% is not net +4%');
 assert.deepEqual(decideExit({...costed,currentLamports:1_076_000_000n}),{sell:true,reason:'TAKE_PROFIT'});
});

test('with no cost configured behaviour is unchanged',()=>{
 const rules={...NO_EXIT_RULES,takeProfitPct:4};
 assert.deepEqual(decideExit(base({rules,currentLamports:1_040_000_000n})),{sell:true,reason:'TAKE_PROFIT'});
});

test('costs never delay a stop loss, they make it worse',()=>{
 const rules={...NO_EXIT_RULES,stopLossPct:10};
 assert.deepEqual(decideExit(base({rules,roundTripCostPct:3.5,currentLamports:900_000_000n})),
  {sell:true,reason:'STOP_LOSS'});
});

test('a take profit that cannot clear costs is rejected as unreachable',()=>{
 assert.throws(()=>decideExit(base({
  rules:{...NO_EXIT_RULES,takeProfitPct:2},roundTripCostPct:3.5,
 })),/UNREACHABLE_TAKE_PROFIT/);
});
