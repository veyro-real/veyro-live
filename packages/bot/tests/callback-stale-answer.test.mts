process.env.VEYRO_STORE='memory';
import test from 'node:test';import assert from 'node:assert/strict';
const {route}=await import('../src/telegram/router');
import type {Deps,Sent} from '../src/telegram/router';

const STALE='TELEGRAM_HTTP_400: Bad Request: query is too old and response '+
 'timeout expired or query ID is invalid';

function harness(answerThrows:boolean){
 const sent:Sent[]=[];const bought:unknown[]=[];
 const deps={
  app:{
   ensureUser:async()=>({id:'u-1',telegramChatId:'99'}),
   buy:async(...a:unknown[])=>{bought.push(a);return {
    position:{id:'p1',symbol:'WIF',paper:false},
    result:{ok:true,signature:'sig',outAmount:'1'}};},
  },
  out:{
   send:async(chatId:string,text:string)=>{sent.push({chatId,text} as Sent);},
   answer:async()=>{if(answerThrows)throw Error(STALE);},
   photo:async()=>{},voiceNote:async()=>{},edit:async()=>{},
  },
  pending:{put:async()=>{},take:async()=>({userId:'u-1',chatId:'99',mint:'M',sol:0.1})},
  pendingAction:{put:async()=>{},take:async()=>null,clear:async()=>{}},
 } as unknown as Deps;
 return {sent,bought,deps};
}

const confirm=(h:ReturnType<typeof harness>)=>route({update_id:9,callback_query:{
 id:'cb-1',data:'b:abc123',from:{id:99,username:'j'},
 message:{message_id:5,chat:{id:99}}}} as never,h.deps);

test('a confirm tap buys when the callback answers normally',async()=>{
 const h=harness(false);
 await confirm(h);
 assert.equal(h.bought.length,1,'the buy did not run');
});

/**
 * answerCallbackQuery only dismisses the spinner. Its id expires after about
 * a minute, so a tap that lands during a redeploy fails it — and because it
 * was awaited before the work, the tap was lost and the user saw a raw
 * Telegram error instead of their trade.
 */
test('a stale callback id does not cost the user their trade',async()=>{
 const h=harness(true);
 await confirm(h);
 assert.equal(h.bought.length,1,'the buy was dropped because the spinner failed');
 const text=h.sent.map(s=>s.text).join('\n');
 assert.doesNotMatch(text,/TELEGRAM_HTTP_400|query ID is invalid/,
  'a raw Telegram error reached the user');
 assert.match(text,/Bought/);
});
