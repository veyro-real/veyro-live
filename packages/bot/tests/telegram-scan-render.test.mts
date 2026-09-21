import test from 'node:test';import assert from 'node:assert/strict';
import {scan,WHY} from '../src/telegram/render';
import type {ScanRow} from '../src/app';

const MINT='Gs4MZmALhnwt6B25XX3u8kbE9EzzdH2a8zT1E6Njpump';
const row=(over:Partial<{symbol:string;mint:string;ageSeconds:number;holders:number|null;
 uniqueBuyers:number|null;liquiditySol:number|null;top10Pct:number|null}>={}):ScanRow=>({
 candidate:{mint:over.mint??MINT,symbol:over.symbol??'LMAO',name:'lmao',launchpad:'pumpfun',
  creator:'c',firstSeen:new Date().toISOString(),initialBuySol:null,marketCapSol:null,uri:null} as never,
 assessment:{mint:over.mint??MINT,at:'',passed:true,rejections:[],score:5,features:{
  ageSeconds:over.ageSeconds??240,holders:over.holders===undefined?62:over.holders,
  top10Pct:over.top10Pct===undefined?22:over.top10Pct,floatHolders:40,
  creatorLaunchCount:1,creatorGraduationCount:0,
  liquiditySol:over.liquiditySol===undefined?3.1:over.liquiditySol,marketCapSol:10,
  buyCount:20,sellCount:2,uniqueBuyers:over.uniqueBuyers===undefined?18:over.uniqueBuyers,
  mintAuthorityRevoked:true,freezeAuthorityRevoked:true}} as never,
 match:null,
});

test('an empty scan says why it is empty',()=>{
 const {text,keyboard}=scan([]);
 assert.match(text,/Nothing passed/);
 assert.deepEqual(keyboard,[]);
});

test('each candidate shows the numbers that actually differ between them',()=>{
 const {text}=scan([row()]);
 assert.match(text,/LMAO/);
 assert.match(text,/62 holders/);
 assert.match(text,/18 buyers/);
 assert.match(text,/3\.1 SOL/);
 assert.match(text,/4m old/);
});

// The same rule as the wallet balance: unmeasured is not zero.
test('a measurement that is missing reads as unknown, never as zero',()=>{
 const {text}=scan([row({holders:null,uniqueBuyers:null,liquiditySol:null})]);
 assert.doesNotMatch(text,/0 holders/);
 assert.doesNotMatch(text,/0 buyers/);
 assert.doesNotMatch(text,/0 SOL/);
 assert.match(text,/unknown/i);
});

test('the full mint is present so it can be copied',()=>{
 assert.match(scan([row()]).text,new RegExp(MINT));
});

test('every candidate gets a why button inside the callback cap',()=>{
 const {keyboard}=scan([row(),row({symbol:'PANDA',mint:'GgZc2RwDY4pWZ92GRjZZBZV5tbUF66Xq4qFBqfccpump'})]);
 const flat=keyboard.flat();
 assert.equal(flat.length,2);
 for(const b of flat){
  assert.ok(b.callback_data.startsWith(WHY));
  assert.ok(Buffer.byteLength(b.callback_data)<=64,b.callback_data);
 }
});

test('the list is capped so the keyboard stays usable',()=>{
 const many=Array.from({length:30},(_,i)=>row({symbol:'T'+i,mint:MINT.slice(0,-2)+String(i).padStart(2,'0')}));
 assert.ok(scan(many).keyboard.flat().length<=8);
});
