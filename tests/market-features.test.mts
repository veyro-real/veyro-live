import test from 'node:test';import assert from 'node:assert/strict';
const {readMintFacts,buildFeatures}=await import('../lib/market/features');
import type {ChainReader} from '../lib/market/features';
import type {Candidate} from '../lib/types';

const MINT='Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';
const CURVE='8SgNwESovnbG1oNEaPVhg6CR9mTMSK7jPvcYRe3wpump';
const acct=(address:string,amount:string|number,owner='someone')=>({address,amount:String(amount),owner});
const reader=(o:Partial<ChainReader>={}):ChainReader=>({
 mintInfo:async()=>({mintAuthority:null,freezeAuthority:null,supply:'1000',decimals:0}),
 largestAccounts:async()=>[],
 ...o,
});

test('a null authority means revoked, a present one means live',async()=>{
 assert.equal((await readMintFacts(MINT,reader())).mintAuthorityRevoked,true);
 const live=await readMintFacts(MINT,reader({mintInfo:async()=>({mintAuthority:'S',freezeAuthority:'S',supply:'1000',decimals:0})}));
 assert.equal(live.mintAuthorityRevoked,false);
 assert.equal(live.freezeAuthorityRevoked,false);
});

test('an unreadable mint reports unknown, never revoked',async()=>{
 const f=await readMintFacts(MINT,reader({mintInfo:async()=>null}));
 assert.equal(f.mintAuthorityRevoked,null);
 assert.equal(f.top10Pct,null);
});

test('an RPC failure reports unknown rather than throwing',async()=>{
 const f=await readMintFacts(MINT,reader({mintInfo:async()=>{throw Error('429');}}));
 assert.equal(f.mintAuthorityRevoked,null);
});

test('with no bonding curve, concentration is the top ten over total supply',async()=>{
 const f=await readMintFacts(MINT,reader({
  largestAccounts:async()=>[acct('a',300),acct('b',100),acct('c',100)],
 }));
 assert.equal(f.top10Pct,50);
});

test('only the ten largest count',async()=>{
 const f=await readMintFacts(MINT,reader({
  largestAccounts:async()=>Array.from({length:20},(_,i)=>acct('a'+i,50)),
 }));
 assert.equal(f.top10Pct,50);
});

test('the bonding curve is excluded from both the holders and the float',async()=>{
 // supply 1000: curve holds 800, real holders hold 200 between them.
 const f=await readMintFacts(MINT,reader({
  largestAccounts:async()=>[
   acct('curveAta',800,CURVE),acct('h1',50,'w1'),acct('h2',50,'w2'),acct('h3',100,'w3'),
  ],
 }),CURVE);
 // The curve's 800 is gone from both sides of the ratio.
 assert.equal(f.top10Pct,100);
});

test('excluding the curve is what lets a fresh launch look distributed',async()=>{
 const holders=Array.from({length:30},(_,i)=>acct('h'+i,10,'w'+i)); // 300 spread wide
 const f=await readMintFacts(MINT,reader({
  mintInfo:async()=>({mintAuthority:null,freezeAuthority:null,supply:'1000',decimals:0}),
  largestAccounts:async()=>[acct('curveAta',700,CURVE),...holders],
 }),CURVE);
 // float 300, top ten of it = 100, so 33.3%
 assert.ok(f.top10Pct!==null&&f.top10Pct>33&&f.top10Pct<34,'got '+f.top10Pct);
});

test('a curve holding the entire supply leaves no float to measure',async()=>{
 const f=await readMintFacts(MINT,reader({
  largestAccounts:async()=>[acct('curveAta',1000,CURVE)],
 }),CURVE);
 assert.equal(f.top10Pct,null,'no float is unknown, not zero');
});

test('zero supply does not divide by zero',async()=>{
 const f=await readMintFacts(MINT,reader({
  mintInfo:async()=>({mintAuthority:null,freezeAuthority:null,supply:'0',decimals:0}),
  largestAccounts:async()=>[acct('a',10)],
 }));
 assert.equal(f.top10Pct,null);
});

test('features combine the feed numbers with the chain facts',()=>{
 const c:Candidate={
  mint:MINT,symbol:'WIF',name:'dogwifhat',launchpad:'pump.fun',creator:'C',
  firstSeen:new Date(Date.now()-45_000).toISOString(),initialBuySol:2,marketCapSol:40,uri:'x',
 };
 const f=buildFeatures(c,32.5,{mintAuthorityRevoked:true,freezeAuthorityRevoked:true,top10Pct:12});
 assert.ok(f.ageSeconds>=44&&f.ageSeconds<=47,'age: '+f.ageSeconds);
 assert.equal(f.liquiditySol,32.5);
 assert.equal(f.top10Pct,12);
 assert.equal(f.holders,null,'not measured, so not claimed');
});

test('observed flow fills the trade fields the filter already understands',()=>{
 const c:Candidate={
  mint:MINT,symbol:'WIF',name:'dogwifhat',launchpad:'pump.fun',creator:'C',
  firstSeen:new Date(Date.now()-30_000).toISOString(),initialBuySol:2,marketCapSol:40,uri:'x',
 };
 const facts={mintAuthorityRevoked:true,freezeAuthorityRevoked:true,top10Pct:18};
 const f=buildFeatures(c,31,facts,{buys:40,sells:6,uniqueBuyers:33});
 assert.equal(f.buyCount,40);
 assert.equal(f.sellCount,6);
 assert.equal(f.uniqueBuyers,33);
 assert.equal(f.holders,null,'holder count still is not measured, so it is not claimed');
});

test('without an observation those fields stay unmeasured',()=>{
 const c:Candidate={
  mint:MINT,symbol:'WIF',name:'d',launchpad:'pump.fun',creator:'C',
  firstSeen:new Date().toISOString(),initialBuySol:1,marketCapSol:10,uri:'x',
 };
 const f=buildFeatures(c,5,{mintAuthorityRevoked:true,freezeAuthorityRevoked:true,top10Pct:10});
 assert.equal(f.buyCount,null);
 assert.equal(f.uniqueBuyers,null);
});

test('the curve is excluded by who owns the account, not by a derived address',async()=>{
 // The real failure: pump.fun tokens are Token-2022, so a classic-SPL ATA
 // derivation produces an address that appears nowhere in the holders.
 const f=await readMintFacts(MINT,reader({
  mintInfo:async()=>({mintAuthority:null,freezeAuthority:null,supply:'1000',decimals:0}),
  largestAccounts:async()=>[
   acct('curveAta',700,CURVE),   // owned by the bonding curve
   ...Array.from({length:10},(_,i)=>acct('h'+i,30,'holder'+i)),
  ],
 }),CURVE);
 // float is 300, top ten of it is 300, so 100% -- but the curve's 700 is gone
 assert.equal(f.top10Pct,100);
});

test('an owner that merely looks similar is not excluded',async()=>{
 const f=await readMintFacts(MINT,reader({
  mintInfo:async()=>({mintAuthority:null,freezeAuthority:null,supply:'1000',decimals:0}),
  largestAccounts:async()=>[acct('a',500,'NotTheCurve'),acct('b',500,'AlsoNot')],
 }),CURVE);
 assert.equal(f.top10Pct,100,'nothing excluded, so the full supply is the base');
});

test('several accounts owned by the curve are all excluded',async()=>{
 const f=await readMintFacts(MINT,reader({
  mintInfo:async()=>({mintAuthority:null,freezeAuthority:null,supply:'1000',decimals:0}),
  largestAccounts:async()=>[
   acct('c1',400,CURVE),acct('c2',300,CURVE),
   acct('h1',150,'h1'),acct('h2',150,'h2'),
  ],
 }),CURVE);
 assert.equal(f.top10Pct,100,'float is 300 and both holders are in the top ten');
});

test('an unknown owner does not silently count as the curve',async()=>{
 const f=await readMintFacts(MINT,reader({
  mintInfo:async()=>({mintAuthority:null,freezeAuthority:null,supply:'1000',decimals:0}),
  largestAccounts:async()=>[acct('a',900,null as unknown as string),acct('h',100,'h')],
 }),CURVE);
 assert.equal(f.top10Pct,100,'unreadable owner stays counted, which is the cautious side');
});

test('the size of the real float is reported, not just its concentration',async()=>{
 const f=await readMintFacts(MINT,reader({
  mintInfo:async()=>({mintAuthority:null,freezeAuthority:null,supply:'1000',decimals:0}),
  largestAccounts:async()=>[
   acct('curve',700,CURVE),
   acct('h1',200,'w1'),acct('h2',100,'w2'),
   acct('empty',0,'w3'),
  ],
 }),CURVE);
 assert.equal(f.floatHolders,2,'zero balances are not holders');
});

test('a token whose supply is entirely protocol held has no float holders',async()=>{
 const f=await readMintFacts(MINT,reader({
  largestAccounts:async()=>[acct('curve',1000,CURVE),acct('e',0,'w1')],
 }),CURVE);
 assert.equal(f.floatHolders,0);
 assert.equal(f.top10Pct,null);
});
