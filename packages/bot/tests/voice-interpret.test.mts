import test from 'node:test';import assert from 'node:assert/strict';
const {toSpokenBuy,openaiInterpreter}=await import('../src/voice/interpret');

test('a clean buy with an amount becomes a trade',()=>{
 assert.deepEqual(toSpokenBuy({buy:true,amount:1,unit:'usd',target:'trending',symbol:null}),
  {kind:'buyTrending',usd:1});
 assert.deepEqual(toSpokenBuy({buy:true,amount:0.05,unit:'sol',target:'symbol',symbol:'WIF'}),
  {kind:'buyBySymbol',symbol:'wif',sol:0.05});
 assert.deepEqual(toSpokenBuy({buy:true,amount:0.5,unit:'usd',target:'trending',symbol:null}),
  {kind:'buyTrending',usd:0.5});
});

test('no amount is never a trade, whatever else was said',()=>{
 assert.equal(toSpokenBuy({buy:true,amount:null,unit:null,target:'trending',symbol:null}),null);
 assert.equal(toSpokenBuy({buy:true,amount:0,unit:'usd',target:'trending',symbol:null}),null);
 assert.equal(toSpokenBuy({buy:true,amount:-5,unit:'usd',target:'trending',symbol:null}),null);
});

test('not a buy is nothing, so selling can never come out of this',()=>{
 assert.equal(toSpokenBuy({buy:false,amount:5,unit:'usd',target:'symbol',symbol:'WIF'}),null);
 assert.equal(toSpokenBuy({}),null);
});

test('a unit that is neither usd nor sol is refused, not assumed',()=>{
 assert.equal(toSpokenBuy({buy:true,amount:5,unit:'euros' as any,target:'trending',symbol:null}),null);
 assert.equal(toSpokenBuy({buy:true,amount:5,unit:null,target:'trending',symbol:null}),null);
});

test('a symbol that is not a plausible ticker is refused',()=>{
 assert.equal(toSpokenBuy({buy:true,amount:5,unit:'usd',target:'symbol',symbol:'a token with spaces'}),null);
 assert.equal(toSpokenBuy({buy:true,amount:5,unit:'usd',target:'symbol',symbol:''}),null);
});

test('no api key means the interpreter never calls out and returns null',async()=>{
 let called=false;
 const original=globalThis.fetch;
 globalThis.fetch=(async()=>{called=true;return new Response('{}');}) as any;
 try{
  const r=await openaiInterpreter({apiKey:''}).interpret('buy a dollar of the dumbest meme coin');
  assert.equal(r,null);
  assert.equal(called,false,'called the API with no key');
 }finally{globalThis.fetch=original;}
});

test('a live-shaped response is parsed into a buy',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=(async()=>new Response(JSON.stringify({
  choices:[{message:{content:JSON.stringify({buy:true,amount:1,unit:'usd',target:'trending',symbol:null})}}],
 }),{status:200})) as any;
 try{
  const r=await openaiInterpreter({apiKey:'k'}).interpret('spent a buck on the dumbest coin');
  assert.deepEqual(r,{kind:'buyTrending',usd:1});
 }finally{globalThis.fetch=original;}
});

test('an upstream failure or bad json degrades to null, never a guess',async()=>{
 const original=globalThis.fetch;
 for(const bad of [
  async()=>new Response('nope',{status:500}),
  async()=>new Response('not json',{status:200}),
  async()=>{throw Error('socket hang up');},
 ]){
  globalThis.fetch=bad as any;
  assert.equal(await openaiInterpreter({apiKey:'k'}).interpret('buy a dollar'),null);
 }
 globalThis.fetch=original;
});
