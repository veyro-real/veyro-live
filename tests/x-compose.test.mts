import test from 'node:test';import assert from 'node:assert/strict';
const {postTrade,postRejectionDigest,postReply,LIMIT}=await import('../lib/x/compose');
import type {Position} from '../lib/types';

const MINT='EnGnwy5koQkE8i2HLAfmNqyCmjdPhyG12yyPutTQpump';
const filled=(o:Partial<Position>={}):Position=>({
 id:'p1',userId:'u1',mint:MINT,symbol:'WIF',status:'OPEN',entrySignature:'5xSig',
 entryLamports:'250000000',tokensReceived:'1000000',exitSignature:null,exitLamports:null,
 reason:'FILLED',openedAt:new Date().toISOString(),closedAt:null,...o,
});

test('a trade post says what was bought and what it cost',()=>{
 const t=postTrade(filled(),{score:71,top10Pct:22})!;
 assert.match(t,/WIF/);
 assert.match(t,/0\.25/);
 assert.match(t,/71/);
});

test('nothing is posted for a position that never filled',()=>{
 assert.equal(postTrade(filled({status:'OPENING',entrySignature:null}),{score:71,top10Pct:22}),null,
  'announcing a trade before it settles is how you front-run yourself');
 assert.equal(postTrade(filled({status:'FAILED'}),{score:71,top10Pct:22}),null);
});

test('posts never forecast, whatever the house style',()=>{
 const all=[
  postTrade(filled(),{score:99,top10Pct:5}),
  postRejectionDigest({measured:312,rejected:309,top:[['MINT_AUTHORITY_LIVE',128],['INSIDER_CONCENTRATION',70]]}),
  postReply(MINT,{passed:false,score:0,rejections:['LP_NOT_LOCKED']}),
 ].join(' ')
  // A shortened mint is an address, not our prose. pump.fun mints end in
  // "pump", and that must not read as hype language.
  .replace(/[1-9A-HJ-NP-Za-km-z]{4}…[1-9A-HJ-NP-Za-km-z]{4}/g,'<mint>');
 assert.doesNotMatch(all,/moon|gem|alpha|guaranteed|will go|easy money|to the moon/i);
});

test('the shortened mint keeps both ends, since pump.fun suffixes all match',()=>{
 const t=postReply(MINT,null)!;
 assert.match(t,/EnGn…pump/,'prefix alone would not distinguish two pump.fun mints');
});

test('every post fits X without truncation',()=>{
 const long={measured:99999,rejected:99998,top:[['CREATOR_SERIAL_LAUNCHER',5000],['INSIDER_CONCENTRATION',4000],['BUNDLED_LAUNCH',3000]] as [string,number][]};
 for(const t of [
  postTrade(filled({symbol:'A'.repeat(40)}),{score:71,top10Pct:22}),
  postRejectionDigest(long),
  postReply(MINT,{passed:false,score:0,rejections:['LP_NOT_LOCKED','MINT_AUTHORITY_LIVE','INSIDER_CONCENTRATION','BUNDLED_LAUNCH','TOO_OLD']}),
 ]){
  assert.ok(t!==null&&t.length<=LIMIT,'over the limit: '+(t?t.length:'null'));
 }
});

test('a mint is shortened, never posted in full',()=>{
 const t=postTrade(filled(),{score:71,top10Pct:22})!;
 assert.doesNotMatch(t,new RegExp(MINT));
 assert.match(t,/EnGn/);
});

test('the rejection digest leads with how many were thrown out',()=>{
 const t=postRejectionDigest({measured:312,rejected:309,top:[['MINT_AUTHORITY_LIVE',128]]});
 assert.match(t,/312/);
 assert.match(t,/309/);
 assert.match(t,/MINT_AUTHORITY_LIVE|mint authority/i);
});

test('a digest with nothing measured is not posted',()=>{
 assert.equal(postRejectionDigest({measured:0,rejected:0,top:[]}),null,
  'silence beats posting that we did nothing');
});

test('a reply states the verdict and the reasons',()=>{
 const r=postReply(MINT,{passed:false,score:0,rejections:['LP_NOT_LOCKED','TOO_OLD']})!;
 assert.match(r,/LP_NOT_LOCKED/);
 assert.match(r,/TOO_OLD/);
 assert.match(r,/EnGn/);
});

test('a reply about an unmeasured mint says so rather than inventing a verdict',()=>{
 const r=postReply(MINT,null)!;
 assert.match(r,/not measured|no measurement|never/i);
});

test('a passing reply does not become a recommendation',()=>{
 const r=postReply(MINT,{passed:true,score:71,rejections:[]})!;
 assert.match(r,/71/);
 assert.doesNotMatch(r,/buy|recommend|should|good/i);
});
