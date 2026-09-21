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
 assert.match(h.sent[0]!.text,/custody/i);
 assert.match(h.sent[0]!.text,/held by this service|holds your keys/i);
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
