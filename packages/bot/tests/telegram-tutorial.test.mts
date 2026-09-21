import test from 'node:test';import assert from 'node:assert/strict';
import {STEPS,stepMessage,TUTORIAL} from '../src/telegram/tutorial';

test('every step is reachable and numbered for the reader',()=>{
 assert.ok(STEPS.length>=6,'a walkthrough shorter than this is a help page');
 STEPS.forEach((_,i)=>{
  const {text}=stepMessage(i);
  assert.match(text,new RegExp(`Step ${i+1} of ${STEPS.length}`));
 });
});

test('the first step states custody before anything else',()=>{
 const {text}=stepMessage(0);
 assert.match(text,/holds your keys|holds the key|private key/i);
 assert.match(text,/afford to lose|willing to lose/i);
});

test('navigation is bounded at both ends',()=>{
 const first=stepMessage(0).keyboard.flat().map(b=>b.callback_data);
 assert.ok(!first.some(d=>d===TUTORIAL+'-1'),'no back button before the first step');
 assert.ok(first.some(d=>d===TUTORIAL+'1'),'first step must go forward');

 const last=stepMessage(STEPS.length-1).keyboard.flat().map(d=>d.callback_data);
 assert.ok(!last.some(d=>d===TUTORIAL+String(STEPS.length)),'no next button past the end');
 assert.ok(last.some(d=>d===TUTORIAL+String(STEPS.length-2)),'last step must go back');
});

test('an out-of-range index is clamped rather than throwing',()=>{
 assert.equal(stepMessage(-5).text,stepMessage(0).text);
 assert.equal(stepMessage(999).text,stepMessage(STEPS.length-1).text);
});

test('every callback fits the 64-byte Telegram cap',()=>{
 STEPS.forEach((_,i)=>{
  for(const b of stepMessage(i).keyboard.flat()){
   assert.ok(Buffer.byteLength(b.callback_data)<=64,b.callback_data);
  }
 });
});

// AGENTS.md: the launch feed is never alpha, an edge, or a prediction.
test('the walkthrough never promises an outcome',()=>{
 const all=STEPS.map((_,i)=>stepMessage(i).text).join('\n').toLowerCase();
 for(const banned of ['alpha','guaranteed','profit','moon','easy money','can\'t lose','prediction','we predict']){
  assert.ok(!all.includes(banned),`walkthrough claims "${banned}"`);
 }
});
