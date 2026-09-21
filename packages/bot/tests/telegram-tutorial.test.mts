import test from 'node:test';import assert from 'node:assert/strict';
import {assertDisclosesCustody} from './helpers/custody.mts';
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
 assertDisclosesCustody(text,'step 1');
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

// /start is the first thing anyone sends, so it is the walkthrough itself
// rather than a page that tells you a walkthrough exists.
const {route}=await import('../src/telegram/router');
import type {Deps,Sent} from '../src/telegram/router';

function harness(){
 const sent:Sent[]=[];const edits:{messageId:number;text:string}[]=[];
 const deps={
  app:{ensureUser:async()=>({id:'u-1',telegramChatId:'99'})},
  out:{send:async(chatId:string,text:string,keyboard?:unknown)=>{sent.push({chatId,text,keyboard} as Sent);},
       answer:async()=>{},photo:async()=>{},voiceNote:async()=>{},
       edit:async(_c:string,messageId:number,text:string)=>{edits.push({messageId,text});}},
  pendingAction:{put:async()=>{},take:async()=>null,clear:async()=>{}},
  pending:{put:async()=>{},take:async()=>null},
 } as unknown as Deps;
 return {sent,edits,deps};
}
const msg=(text:string)=>({update_id:1,message:{message_id:1,chat:{id:99},from:{username:'j'},text}});

test('/start opens the walkthrough at step one',async()=>{
 const h=harness();
 await route(msg('/start') as never,h.deps);
 assert.equal(h.sent.length,1);
 assert.match(h.sent[0]!.text,new RegExp(`Step 1 of ${STEPS.length}`));
 assertDisclosesCustody(h.sent[0]!.text,'/start');
 assert.ok((h.sent[0]!.keyboard as {callback_data:string}[][]).flat()
  .some(b=>b.callback_data===TUTORIAL+'1'),'start must offer the next step');
});

test('/tutorial opens the same first screen',async()=>{
 const a=harness(),b=harness();
 await route(msg('/start') as never,a.deps);
 await route(msg('/tutorial') as never,b.deps);
 assert.equal(a.sent[0]!.text,b.sent[0]!.text);
});

test('tapping next edits the message instead of sending another',async()=>{
 const h=harness();
 await route({update_id:2,callback_query:{id:'c1',data:TUTORIAL+'1',
  from:{id:99,username:'j'},message:{message_id:5,chat:{id:99}}}} as never,h.deps);
 assert.equal(h.sent.length,0,'no new message');
 assert.equal(h.edits.length,1);
 assert.match(h.edits[0]!.text,new RegExp(`Step 2 of ${STEPS.length}`));
});

import {stepAction,TUTORIAL_DO} from '../src/telegram/tutorial';

test('every screen that suggests a command can run it',()=>{
 const withActions=STEPS.map((s,i)=>s.action?i:-1).filter(i=>i>=0);
 assert.ok(withActions.length>=4,'a tour you can only read is a help page');
 for(const i of withActions){
  assert.ok(stepAction(i),`step ${i+1} offers a button with no command`);
  assert.ok(stepMessage(i).keyboard.flat()
   .some(b=>b.callback_data===TUTORIAL_DO+String(i)),`step ${i+1} button is not wired`);
 }
});

test('the limits button names the exact numbers it will set',()=>{
 const step=STEPS.find(s=>s.action?.command.kind==='limits');
 assert.ok(step,'no limits action');
 const set=(step!.action!.command as {set:{maxTradeSol:number;dailyCapSol:number;hours:number}}).set;
 assert.ok(step!.action!.label.includes(String(set.maxTradeSol)),'label hides the per-trade cap');
 assert.ok(step!.action!.label.includes(String(set.dailyCapSol)),'label hides the daily cap');
 assert.ok(step!.action!.label.includes(String(set.hours)),'label hides the expiry');
});

test('tapping an action runs it as a new message, leaving the tour in place',async()=>{
 const h=harness();
 const scanStep=STEPS.findIndex(s=>s.action?.command.kind==='scan');
 let ran:unknown=null;
 (h.deps.app as unknown as {scan:unknown}).scan=async(...a:unknown[])=>{ran=a;return [];};
 await route({update_id:3,callback_query:{id:'c2',data:TUTORIAL_DO+String(scanStep),
  from:{id:99,username:'j'},message:{message_id:5,chat:{id:99}}}} as never,h.deps);
 assert.ok(ran,'the scan command never ran');
 assert.equal(h.edits.length,0,'an action must not overwrite the tour');
 assert.equal(h.sent.length,1,'the result should arrive as its own message');
});
