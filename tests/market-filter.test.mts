import test from 'node:test';import assert from 'node:assert/strict';
const {assess}=await import('../lib/market/filter');
import type {Candidate,Features} from '../lib/types';

const candidate=(o:Partial<Candidate>={}):Candidate=>({
 mint:'M',symbol:'WIF',name:'dogwifhat',launchpad:'pump.fun',creator:'C',
 firstSeen:new Date().toISOString(),initialBuySol:2,marketCapSol:40,uri:'ipfs://x',...o,
});
/** A candidate that passes everything, so each test changes exactly one thing. */
const clean=(o:Partial<Features>={}):Features=>({
 ageSeconds:20,holders:80,top10Pct:15,creatorLaunchCount:2,creatorGraduationCount:1,
 liquiditySol:25,marketCapSol:40,buyCount:40,sellCount:5,uniqueBuyers:35,
 mintAuthorityRevoked:true,freezeAuthorityRevoked:true,...o,
});

test('a clean candidate passes with no rejections',()=>{
 const a=assess(candidate(),clean());
 assert.equal(a.passed,true);
 assert.deepEqual(a.rejections,[]);
 assert.ok(a.score>0);
});

test('a live mint authority is a rejection',()=>{
 const a=assess(candidate(),clean({mintAuthorityRevoked:false}));
 assert.equal(a.passed,false);
 assert.ok(a.rejections.includes('MINT_AUTHORITY_LIVE'));
});

test('a live freeze authority is a rejection',()=>{
 assert.ok(assess(candidate(),clean({freezeAuthorityRevoked:false})).rejections.includes('FREEZE_AUTHORITY_LIVE'));
});

test('insider concentration is a rejection',()=>{
 assert.ok(assess(candidate(),clean({top10Pct:55})).rejections.includes('INSIDER_CONCENTRATION'));
});

test('a serial launcher is a rejection',()=>{
 assert.ok(assess(candidate(),clean({creatorLaunchCount:40})).rejections.includes('CREATOR_SERIAL_LAUNCHER'));
});

test('a creator who launches often and never graduates is a prior rug',()=>{
 const a=assess(candidate(),clean({creatorLaunchCount:12,creatorGraduationCount:0}));
 assert.ok(a.rejections.includes('CREATOR_PRIOR_RUG'));
});

test('thin liquidity is a rejection',()=>{
 assert.ok(assess(candidate(),clean({liquiditySol:0.4})).rejections.includes('LIQUIDITY_TOO_THIN'));
});

test('market cap outside the band is a rejection in both directions',()=>{
 assert.ok(assess(candidate(),clean({marketCapSol:0.5})).rejections.includes('MARKET_CAP_OUT_OF_RANGE'));
 assert.ok(assess(candidate(),clean({marketCapSol:900000})).rejections.includes('MARKET_CAP_OUT_OF_RANGE'));
});

test('a stale launch is a rejection',()=>{
 assert.ok(assess(candidate(),clean({ageSeconds:4000})).rejections.includes('TOO_OLD'));
});

test('no metadata uri is no social footprint',()=>{
 assert.ok(assess(candidate({uri:null}),clean()).rejections.includes('NO_SOCIAL_FOOTPRINT'));
});

test('many buys from very few buyers is a bundled launch',()=>{
 assert.ok(assess(candidate(),clean({buyCount:60,uniqueBuyers:3})).rejections.includes('BUNDLED_LAUNCH'));
});

test('an unmeasured safety property rejects rather than passes',()=>{
 const a=assess(candidate(),clean({mintAuthorityRevoked:null}));
 assert.equal(a.passed,false,'unknown authority must not be treated as revoked');
 assert.ok(a.rejections.includes('MINT_AUTHORITY_LIVE'));
});

test('every rejection is collected, not just the first',()=>{
 const a=assess(candidate({uri:null}),clean({mintAuthorityRevoked:false,top10Pct:70}));
 assert.ok(a.rejections.length>=3);
});

test('a rejected candidate scores zero so nothing can rank it up',()=>{
 assert.equal(assess(candidate(),clean({mintAuthorityRevoked:false})).score,0);
});

test('score is bounded and rewards more holders over fewer',()=>{
 const low=assess(candidate(),clean({holders:20,uniqueBuyers:15})).score;
 const high=assess(candidate(),clean({holders:400,uniqueBuyers:300})).score;
 assert.ok(high>low,'more distinct participation should score higher');
 for(const s of [low,high])assert.ok(s>=0&&s<=100,'score out of range: '+s);
});

test('the assessment carries the measurements it judged',()=>{
 const f=clean();
 const a=assess(candidate(),f);
 assert.deepEqual(a.features,f);
 assert.equal(a.mint,'M');
 assert.ok(Date.parse(a.at)>0);
});

test('unmeasured concentration is a rejection, the same as an unmeasured authority',()=>{
 const a=assess(candidate(),clean({top10Pct:null}));
 assert.equal(a.passed,false,'a rate-limited RPC must not make a token look safer');
 assert.ok(a.rejections.includes('INSIDER_CONCENTRATION'));
});

test('unmeasured economics do not reject, because they are not safety claims',()=>{
 const a=assess(candidate(),clean({liquiditySol:null,marketCapSol:null}));
 assert.equal(a.passed,true);
 assert.deepEqual(a.rejections,[]);
});
