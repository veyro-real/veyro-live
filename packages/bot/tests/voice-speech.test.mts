import test from 'node:test';import assert from 'node:assert/strict';
const {speakable,spokenConfirm,spokenScan,MAX_SPOKEN}=await import('../src/voice/speech');

const MINT='EnGnwy5koQkE8i2HLAfmNqyCmjdPhyG12yyPutTQpump';
const ROW={
 candidate:{mint:MINT,symbol:'WIF',name:'dogwifhat',launchpad:'pump.fun',creator:'C',firstSeen:new Date().toISOString(),initialBuySol:2,marketCapSol:40,uri:null},
 assessment:{mint:MINT,at:'',passed:true,rejections:[],score:71,features:{ageSeconds:14,holders:null,top10Pct:22,creatorLaunchCount:null,creatorGraduationCount:null,liquiditySol:31,marketCapSol:40,buyCount:null,sellCount:null,uniqueBuyers:null,mintAuthorityRevoked:true,freezeAuthorityRevoked:true}},
 match:null,
};

test('a mint address is never read out character by character',()=>{
 const s=speakable('Buy 0.25 SOL of '+MINT+' now');
 assert.doesNotMatch(s,/EnGnwy5koQkE8i2HLAfmNqyCmjdPhyG12yyPutTQpump/);
 assert.match(s,/EnGn/,'a short prefix is enough to identify it');
});

test('urls are dropped rather than spelled out',()=>{
 assert.doesNotMatch(speakable('see https://ipfs.io/ipfs/QmAbc for art'),/https|ipfs\.io/);
});

test('slash commands are spoken as words',()=>{
 assert.match(speakable('use /limits first'),/limits/);
 assert.doesNotMatch(speakable('use /limits first'),/\//);
});

test('speech is capped so a long reply cannot become a five minute monologue',()=>{
 const s=speakable('word '.repeat(2000));
 assert.ok(s.length<=MAX_SPOKEN,'got '+s.length);
});

test('empty or symbol-only text produces nothing to say',()=>{
 assert.equal(speakable(''),'');
 assert.equal(speakable('··· —'),'');
});

test('a spoken confirmation leads with the amount and the token',()=>{
 const s=spokenConfirm(0.25,ROW as any,MINT);
 assert.match(s,/0\.25/);
 assert.match(s,/SOL/i);
 assert.match(s,/WIF/i);
 assert.match(s,/71/,'the score is the point of the summary');
});

test('a spoken confirmation for an unmeasured token says so out loud',()=>{
 const s=spokenConfirm(0.25,null,MINT);
 assert.match(s,/not measured|no measurement|never/i);
});

test('speech never forecasts, same rule as the text',()=>{
 for(const s of [spokenConfirm(0.25,ROW as any,MINT),spokenScan([ROW as any])]){
  assert.doesNotMatch(s,/moon|gem|guaranteed|will go|alpha|easy money/i);
 }
});

test('a scan summary counts what passed rather than reading every mint',()=>{
 const s=spokenScan([ROW,ROW,ROW] as any);
 assert.match(s,/3|three/i);
 assert.ok(s.length<200,'a summary, not a recital: '+s.length);
});

test('an empty scan says nothing passed',()=>{
 assert.match(spokenScan([]),/nothing|none|no candidates/i);
});
