import test from 'node:test';import assert from 'node:assert/strict';
const {matchStrategy}=await import('../lib/strategy/match');
const {compileStrategy}=await import('../lib/strategy/compile');
import type {Assessment,Candidate,Features,Strategy} from '../lib/types';

const features=(over:Partial<Features>={}):Features=>({
 ageSeconds:10,holders:100,top10Pct:10,creatorLaunchCount:1,creatorGraduationCount:1,
 liquiditySol:20,marketCapSol:50,buyCount:30,sellCount:2,uniqueBuyers:25,
 mintAuthorityRevoked:true,freezeAuthorityRevoked:true,...over,
});
const candidate=(over:Partial<Candidate>={}):Candidate=>({
 mint:'M',symbol:'WIF',name:'dogwifhat',launchpad:'pump.fun',creator:'C',
 firstSeen:'',initialBuySol:1,marketCapSol:50,uri:null,...over,
});
const assessment=(over:Partial<Assessment>={}):Assessment=>({
 mint:'M',at:'',passed:true,rejections:[],score:80,features:features(),...over,
});
const strategy=(text:string):Strategy=>({
 id:'s1',userId:'u1',version:2,rawText:text,compiled:compileStrategy(text),active:true,createdAt:'',
});

test('a strategy with no clauses matches anything that passed the filter',()=>{
 const m=matchStrategy(strategy(''),candidate(),assessment());
 assert.equal(m.matched,true);
 assert.deepEqual(m.failedClauses,[]);
 assert.equal(m.strategyId,'s1');
 assert.equal(m.version,2);
});

test('a satisfied clause matches',()=>{
 const m=matchStrategy(strategy('at least 50 holders'),candidate(),assessment());
 assert.equal(m.matched,true);
});

test('a violated clause is named, not just failed',()=>{
 const m=matchStrategy(strategy('at least 500 holders'),candidate(),assessment());
 assert.equal(m.matched,false);
 assert.deepEqual(m.failedClauses,['minHolders']);
});

test('an unmeasured value fails the clause rather than passing it',()=>{
 const a=assessment({features:features({holders:null})});
 const m=matchStrategy(strategy('at least 10 holders'),candidate(),a);
 assert.equal(m.matched,false,'unknown must never count as satisfied');
 assert.deepEqual(m.failedClauses,['minHolders']);
});

test('an unmeasured value is ignored when the strategy does not ask about it',()=>{
 const a=assessment({features:features({holders:null})});
 assert.equal(matchStrategy(strategy('score above 10'),candidate(),a).matched,true);
});

test('every violated clause is reported, not just the first',()=>{
 const m=matchStrategy(strategy('at least 500 holders and score above 95'),candidate(),assessment());
 assert.deepEqual(m.failedClauses.sort(),['minHolders','minScore']);
});

test('age, concentration and market cap ceilings are enforced',()=>{
 assert.equal(matchStrategy(strategy('under 5 seconds old'),candidate(),assessment()).matched,false);
 assert.equal(matchStrategy(strategy('top 10 holders under 5%'),candidate(),assessment()).matched,false);
 assert.equal(matchStrategy(strategy('market cap under 10 SOL'),candidate(),assessment()).matched,false);
 assert.equal(matchStrategy(strategy('market cap over 10 SOL'),candidate(),assessment()).matched,true);
});

test('authority requirements are enforced and unknown is not revoked',()=>{
 const s=strategy('mint authority revoked');
 assert.equal(matchStrategy(s,candidate(),assessment()).matched,true);
 const no=assessment({features:features({mintAuthorityRevoked:false})});
 assert.equal(matchStrategy(s,candidate(),no).matched,false);
 const unknown=assessment({features:features({mintAuthorityRevoked:null})});
 assert.equal(matchStrategy(s,candidate(),unknown).matched,false);
});

test('name filters read both the symbol and the name, case insensitively',()=>{
 assert.equal(matchStrategy(strategy('name includes dog'),candidate(),assessment()).matched,true);
 assert.equal(matchStrategy(strategy('name includes cat'),candidate(),assessment()).matched,false);
 assert.equal(matchStrategy(strategy('exclude wifhat'),candidate(),assessment()).matched,false);
 assert.equal(matchStrategy(strategy('name includes WIF'),candidate(),assessment()).matched,true);
});

test('a candidate that failed the filter never matches, whatever the strategy says',()=>{
 const rejected=assessment({passed:false,rejections:['LP_NOT_LOCKED'],score:0});
 const m=matchStrategy(strategy(''),candidate(),rejected);
 assert.equal(m.matched,false);
 assert.ok(m.failedClauses.includes('rejectedByFilter'));
});
