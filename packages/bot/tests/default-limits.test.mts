import test from 'node:test';import assert from 'node:assert/strict';
import {defaultLimits,DEFAULT_TRADE_FRACTION,DEFAULT_DAY_FRACTION,MIN_TRADE_LAMPORTS}
 from '../src/trade/default-limits';

const SOL=1_000_000_000n;

test('a trade is a small slice of the bag, the day a larger one',()=>{
 const l=defaultLimits(2n*SOL)!;
 assert.equal(l.maxTradeLamports,BigInt(Math.round(Number(2n*SOL)*DEFAULT_TRADE_FRACTION)));
 assert.equal(l.dailyCapLamports,BigInt(Math.round(Number(2n*SOL)*DEFAULT_DAY_FRACTION)));
 assert.ok(l.dailyCapLamports>l.maxTradeLamports);
});

// veyro_limits has `daily_cap_at_least_one_trade`. A default that violates it
// would be rejected by the database at write time.
test('the daily cap always covers at least one trade',()=>{
 for(const bag of [MIN_TRADE_LAMPORTS,SOL/100n,SOL,100n*SOL]){
  const l=defaultLimits(bag);
  if(l)assert.ok(l.dailyCapLamports>=l.maxTradeLamports,`bag ${bag}`);
 }
});

test('a percentage too small to trade is raised to a floor',()=>{
 const l=defaultLimits(SOL/100n)!; // 5% of 0.01 SOL is dust
 assert.ok(l.maxTradeLamports>=MIN_TRADE_LAMPORTS);
});

test('a limit never exceeds what is actually spendable',()=>{
 const tiny=MIN_TRADE_LAMPORTS+1n;
 const l=defaultLimits(tiny)!;
 assert.ok(l.maxTradeLamports<=tiny,'per-trade cap above the balance');
 assert.ok(l.dailyCapLamports<=tiny,'daily cap above the balance');
});

test('an empty wallet gets no limits at all',()=>{
 assert.equal(defaultLimits(0n),null);
 assert.equal(defaultLimits(MIN_TRADE_LAMPORTS-1n),null,
  'a balance too small to place one trade is not worth authorising');
});

test('the defaults expire, so walking away switches spending off',()=>{
 const l=defaultLimits(SOL)!;
 assert.ok(l.hours>0&&l.hours<=24);
});
