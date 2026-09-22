import test from 'node:test';import assert from 'node:assert/strict';
const {solPriceUsd,usdToLamports,USDC_MINT}=await import('../src/trade/price');
const {SOL_MINT}=await import('../src/trade/jupiter');

/** A router that prices one SOL at `usd`. */
const at=(usd:number)=>({
 calls:[] as {inputMint:string;outputMint:string;amount:bigint}[],
 async quote(inputMint:string,outputMint:string,amount:bigint){
  this.calls.push({inputMint,outputMint,amount});
  return {outAmount:String(BigInt(Math.round(usd*1e6)))};
 },
});

test('the price is what selling one whole SOL actually returns',async()=>{
 const deps=at(200);
 assert.equal(await solPriceUsd(deps),200);
 assert.deepEqual(deps.calls,[{
  inputMint:SOL_MINT,outputMint:USDC_MINT,amount:1_000_000_000n,
 }]);
});

test('a hundred dollars at two hundred a SOL is half a SOL',async()=>{
 const {lamports,solPriceUsd:price}=await usdToLamports(100,at(200));
 assert.equal(lamports,500_000_000n);
 assert.equal(price,200,'the rate used is reported, not just applied');
});

test('the conversion follows the price rather than assuming one',async()=>{
 assert.equal((await usdToLamports(100,at(50))).lamports,2_000_000_000n);
 assert.equal((await usdToLamports(25,at(125))).lamports,200_000_000n);
});

// A rate is a divisor. A wrong one does not fail, it silently resizes the
// trade, so the implausible ones have to be refused rather than used.
test('an implausible rate is refused instead of sizing a trade',async()=>{
 for(const bad of [0, 0.01, 250_000]){
  await assert.rejects(()=>usdToLamports(100,at(bad)),/IMPLAUSIBLE_SOL_PRICE/,'$'+bad);
 }
});

test('a price that cannot be read is an error, never an approximation',async()=>{
 const broken={async quote(){throw Error('JUPITER_QUOTE_429');}};
 await assert.rejects(()=>usdToLamports(100,broken),/JUPITER_QUOTE_429/);

 const empty={async quote(){return {outAmount:'0'};}};
 await assert.rejects(()=>usdToLamports(100,empty),/IMPLAUSIBLE_SOL_PRICE/);
});

test('a dollar amount that is not one buys nothing',async()=>{
 for(const bad of [0,-5,Number.NaN,Number.POSITIVE_INFINITY]){
  await assert.rejects(()=>usdToLamports(bad,at(200)),/INVALID_AMOUNT/,String(bad));
 }
});

test('an amount too small to be a lamport is refused, not rounded to zero',async()=>{
 await assert.rejects(()=>usdToLamports(1e-12,at(200)),/INVALID_AMOUNT/);
});

test('the channel-facing conversion refuses with null rather than throwing',async()=>{
 const {usdToSolOrNull}=await import('../src/trade/price');
 assert.equal(await usdToSolOrNull(100,at(200)),0.5);
 assert.equal(await usdToSolOrNull(100,{async quote(){throw Error('down');}}),null);
 assert.equal(await usdToSolOrNull(100,at(0.01)),null,'and on an implausible rate');
 assert.equal(await usdToSolOrNull(-1,at(200)),null);
});
