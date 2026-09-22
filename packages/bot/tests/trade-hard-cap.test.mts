import test from 'node:test';import assert from 'node:assert/strict';
process.env.VEYRO_STORE='memory';

const {buy}=await import('../src/trade/execute');

// The ceiling exists because veyro_claim_spend enforces limits the user sets
// for themselves, and a user can raise those. This one they cannot.

test('an amount over the hard cap is refused before anything is claimed',async()=>{
 process.env.VEYRO_TRADING_ENABLED='true';
 process.env.VEYRO_HARD_MAX_TRADE_LAMPORTS='6000000';
 const out=await buy('u-1','MintAAA',6_000_001n,'AAA','key-over');
 assert.equal(out.result.ok,false);
 assert.equal(out.result.reason,'ABOVE_HARD_CAP');
 assert.equal(out.position.entrySignature,null,'nothing was signed');
});

test('the cap is inclusive: exactly the ceiling is not over it',async()=>{
 process.env.VEYRO_TRADING_ENABLED='false'; // stop before the money path
 process.env.VEYRO_HARD_MAX_TRADE_LAMPORTS='6000000';
 const out=await buy('u-1','MintAAA',6_000_000n,'AAA','key-exact');
 assert.notEqual(out.result.reason,'ABOVE_HARD_CAP');
});

test('a missing or nonsense ceiling falls back to the default, never to none',async()=>{
 process.env.VEYRO_TRADING_ENABLED='true';
 for(const bad of [undefined,'','0','-5','not-a-number']){
  if(bad===undefined)delete process.env.VEYRO_HARD_MAX_TRADE_LAMPORTS;
  else process.env.VEYRO_HARD_MAX_TRADE_LAMPORTS=bad;
  const out=await buy('u-1','MintAAA',1_000_000_000n,'AAA','k-'+String(bad));
  assert.equal(out.result.reason,'ABOVE_HARD_CAP',
   'a 1 SOL trade got through with ceiling='+JSON.stringify(bad));
 }
});

test('the switch still wins over the ceiling',async()=>{
 process.env.VEYRO_TRADING_ENABLED='false';
 process.env.VEYRO_HARD_MAX_TRADE_LAMPORTS='6000000';
 const out=await buy('u-1','MintAAA',1_000n,'AAA','key-off');
 assert.equal(out.result.reason,'TRADING_DISABLED');
});
