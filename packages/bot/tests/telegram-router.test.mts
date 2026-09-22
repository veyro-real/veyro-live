import test from 'node:test';import assert from 'node:assert/strict';
import {assertDisclosesCustody} from './helpers/custody.mts';
const {route}=await import('../src/telegram/router');
import type {Deps,Sent} from '../src/telegram/router';

const MINT='Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';
const USER={id:'u-1',telegramChatId:'99',telegramUsername:'jeremy',walletPubkey:'Wa11et',createdAt:'2026-09-20T00:00:00Z'};
const POSITION={
 id:'6f1b8c3e-9a2d-4c55-8f0e-1b2c3d4e5f60',userId:'u-1',mint:MINT,symbol:'WIF',status:'OPEN',
 entrySignature:'sig-1',entryLamports:'250000000',tokensReceived:'1000',exitSignature:null,
 exitLamports:null,reason:'',openedAt:'2026-09-20T00:00:00Z',closedAt:null,
};

function harness(app:Partial<Deps['app']>={}){
 const sent:Sent[]=[];const answered:{id:string;text?:string}[]=[];
 const photos:{chatId:string;url:string;caption:string;keyboard?:any}[]=[];
 const voices:Buffer[]=[];let voiceOn=false;
 const actionStore=new Map<string,unknown>();let heard:string|null=null;
 let solPrice:number|null=200;
 const store=new Map<string,unknown>();
 const calls:Record<string,unknown[]>={};
 const spy=<T extends(...a:any[])=>any>(name:string,fn:T)=>((...a:any[])=>{(calls[name]??=[]).push(a);return fn(...a);}) as T;
 const deps:Deps={
  app:{
   ensureUser:spy('ensureUser',async()=>USER as any),
   ensureWallet:async()=>({pubkey:'Wa11et',lamports:'500000000'}),
   setLimits:async()=>({userId:'u-1',maxTradeLamports:500000000n,dailyCapLamports:2000000000n,expiresAt:1789000000,active:true,policyAddress:null,agentPubkey:null}),
   getLimits:async()=>null,
   revokeLimits:async()=>{},
   setStrategy:async()=>({id:'s1',userId:'u-1',version:1,rawText:'x',compiled:{} as any,active:true,createdAt:''}),
   getStrategy:async()=>null,
   scan:async()=>[],
   explain:async()=>null,
   buy:async()=>({position:POSITION as any,result:{ok:true,signature:'sig-1',outAmount:'1000'}}),
   sell:async()=>({position:POSITION as any,result:{ok:true,signature:'sig-2',outAmount:'9'}}),
   positions:async()=>[],
   reconcilePositions:async()=>[],
   trending:async()=>TRENDING,
   // Migration 0004 defaults every user to paper, so the harness does too.
   tradingMode:spy('tradingMode',async()=>({mode:'paper',paperLamports:'5000000000'})),
   setTradingMode:async()=>({mode:'paper',paperLamports:'5000000000'}),
   ...app,
  } as Deps['app'],
  out:{
   send:async(chatId,text,keyboard)=>{sent.push({chatId,text,keyboard});},
   answer:async(id,text)=>{answered.push({id,text});},
   photo:async(chatId,url,caption,keyboard)=>{photos.push({chatId,url,caption,keyboard});},
   voiceNote:async(_c,ogg)=>{voices.push(ogg);},
  },
  image:async uri=>uri?('https://cdn.example/'+uri+'.png'):null,
  usdToSol:spy('usdToSol',async(usd:number)=>solPrice===null?null:usd/solPrice),
  voice:{
   enabled:async()=>voiceOn,
   setEnabled:async(_u,on)=>{voiceOn=on;},
   say:async()=>Buffer.from('OggS fake'),
   hear:async()=>heard,
  },
  pendingAction:{
   put:async(k,v)=>{actionStore.set(k,v);},
   take:async(k)=>{const v=actionStore.get(k)??null;actionStore.delete(k);return v as any;},
   clear:async(u)=>{for(const [k,v] of actionStore)if((v as any).userId===u)actionStore.delete(k);},
  },
  pending:{
   put:async(k,v)=>{store.set(k,v);},
   take:async(k)=>{const v=store.get(k)??null;store.delete(k);return v as any;},
  },
 };
  return {deps,sent,answered,photos,voices,calls,
         setHeard:(t:string|null)=>{heard=t;},
         setSolPrice:(p:number|null)=>{solPrice=p;},
         actionStore,last:()=>sent[sent.length-1],
         lastPhoto:()=>photos[photos.length-1]};
}

const message=(text:string,update_id=1)=>({update_id,message:{message_id:5,chat:{id:99},from:{id:99,username:'jeremy'},text}});
const callback=(data:string,update_id=2)=>({update_id,callback_query:{id:'cb-1',data,from:{id:99,username:'jeremy'},message:{message_id:5,chat:{id:99}}}});

test('start tells the user the service holds their keys',async()=>{
 const h=harness();
 await route(message('/start'),h.deps);
 assertDisclosesCustody(h.last().text,'/start');
});

test('wallet shows the deposit address and the balance',async()=>{
 const h=harness();
 await route(message('/wallet'),h.deps);
 assert.match(h.last().text,/Wa11et/);
 assert.match(h.last().text,/0\.5/);
});

test('buy does not trade, it asks for confirmation first',async()=>{
 let traded=false;
 const h=harness({buy:async()=>{traded=true;return {position:POSITION as any,result:{ok:true,signature:'s',outAmount:'1'}};}});
 await route(message('/buy '+MINT+' 0.25'),h.deps);
 assert.equal(traded,false,'no trade before confirmation');
 const keyboard=h.last().keyboard;
 assert.ok(keyboard,'a confirmation keyboard is the commit point');
 const buttons=keyboard!.flat();
 assert.ok(buttons.some(b=>/confirm/i.test(b.text)));
 assert.ok(buttons.some(b=>/cancel/i.test(b.text)));
 for(const b of buttons)assert.ok(Buffer.byteLength(b.callback_data)<=64,'callback_data fits Telegram 64-byte limit');
});

test('confirming executes the buy with the update id as the idempotency key',async()=>{
 const seen:string[]=[];
 const h=harness({buy:async(_u,_m,_s,key)=>{seen.push(key);return {position:POSITION as any,result:{ok:true,signature:'sig-1',outAmount:'1000'}};}});
 await route(message('/buy '+MINT+' 0.25'),h.deps);
 const confirm=h.last().keyboard!.flat().find(b=>/confirm/i.test(b.text))!;
 await route(callback(confirm.callback_data,4242),h.deps);
 assert.deepEqual(seen,['4242']);
 assert.equal(h.answered.length,1);
 assert.match(h.last().text,/sig-1/);
});

test('a confirmation can only be spent once',async()=>{
 let count=0;
 const h=harness({buy:async()=>{count++;return {position:POSITION as any,result:{ok:true,signature:'sig-1',outAmount:'1000'}};}});
 await route(message('/buy '+MINT+' 0.25'),h.deps);
 const confirm=h.last().keyboard!.flat().find(b=>/confirm/i.test(b.text))!;
 await route(callback(confirm.callback_data,10),h.deps);
 await route(callback(confirm.callback_data,11),h.deps);
 assert.equal(count,1,'a replayed confirmation must not buy twice');
 assert.match(h.last().text,/expired|already/i);
});

test('cancelling never reaches the trade path',async()=>{
 let traded=false;
 const h=harness({buy:async()=>{traded=true;return {position:POSITION as any,result:{ok:true,signature:'s',outAmount:'1'}};}});
 await route(message('/buy '+MINT+' 0.25'),h.deps);
 const cancel=h.last().keyboard!.flat().find(b=>/cancel/i.test(b.text))!;
 await route(callback(cancel.callback_data,12),h.deps);
 assert.equal(traded,false);
 assert.match(h.last().text,/cancel/i);
});

test('a denial is explained in plain language, not thrown',async()=>{
 const h=harness({buy:async()=>({position:{...POSITION,status:'FAILED'} as any,result:{ok:false,reason:'DAILY_CAP_EXCEEDED',signature:null}})});
 await route(message('/buy '+MINT+' 0.25'),h.deps);
 const confirm=h.last().keyboard!.flat().find(b=>/confirm/i.test(b.text))!;
 await route(callback(confirm.callback_data,13),h.deps);
 assert.match(h.last().text,/daily cap/i);
});

test('limits writes through to setLimits',async()=>{
 const seen:unknown[]=[];
 const h=harness({setLimits:async(_u,input)=>{seen.push(input);return {userId:'u-1',maxTradeLamports:500000000n,dailyCapLamports:2000000000n,expiresAt:1789000000,active:true,policyAddress:null,agentPubkey:null};}});
 await route(message('/limits 0.5 2 24'),h.deps);
 assert.deepEqual(seen,[{maxTradeSol:0.5,dailyCapSol:2,hours:24}]);
});

test('positions reconciles before it reports',async()=>{
 const order:string[]=[];
 const h=harness({
  reconcilePositions:async()=>{order.push('reconcile');return [];},
  positions:async()=>{order.push('positions');return [POSITION as any];},
 });
 await route(message('/positions'),h.deps);
 assert.deepEqual(order,['reconcile','positions']);
 assert.match(h.last().text,/WIF/);
});

test('connect says X linking is not built yet rather than pretending',async()=>{
 const h=harness();
 await route(message('/connect'),h.deps);
 assert.match(h.last().text,/not (yet )?(available|built|ready)/i);
});

test('an unknown command points at help',async()=>{
 const h=harness();
 await route(message('/frobnicate'),h.deps);
 assert.match(h.last().text,/\/help/);
});

test('a failure inside the app is reported, never thrown at the webhook',async()=>{
 const h=harness({ensureWallet:async()=>{throw Error('SUPABASE_NOT_CONFIGURED');}});
 await route(message('/wallet'),h.deps);
 assert.match(h.last().text,/SUPABASE_NOT_CONFIGURED|went wrong|failed/i);
});

test('updates with no message and no callback are ignored quietly',async()=>{
 const h=harness();
 await route({update_id:7} as any,h.deps);
 assert.equal(h.sent.length,0);
});

test('help lists every command the bot answers',async()=>{
 const h=harness();
 await route(message('/help'),h.deps);
 for(const c of ['/start','/connect','/wallet','/limits','/revoke','/edge','/scan','/why','/buy','/sell','/positions']){
  assert.ok(h.last().text.includes(c),'help omits '+c);
 }
});

test('malformed input answers with the syntax, not an error',async()=>{
 const h=harness();
 await route(message('/buy notamint'),h.deps);
 assert.match(h.last().text,/\/buy/);
 assert.match(h.last().text,/<mint>|mint/i);
});

test('limits with no arguments reports the current mandate',async()=>{
 const h=harness({getLimits:async()=>({userId:'u-1',maxTradeLamports:500000000n,dailyCapLamports:2000000000n,expiresAt:Math.floor(Date.UTC(2026,8,21)/1000),active:true,policyAddress:null,agentPubkey:null})});
 await route(message('/limits'),h.deps);
 assert.match(h.last().text,/0\.5/);
 assert.match(h.last().text,/2/);
});

test('limits with no mandate set says so and does not invent one',async()=>{
 const h=harness({getLimits:async()=>null});
 await route(message('/limits'),h.deps);
 assert.match(h.last().text,/no (spending )?limits|not set/i);
});

test('revoke calls through and confirms',async()=>{
 let revoked=false;
 const h=harness({revokeLimits:async()=>{revoked=true;}});
 await route(message('/revoke'),h.deps);
 assert.equal(revoked,true);
 assert.match(h.last().text,/revoked/i);
});

test('edge with text compiles a strategy, edge alone reports it',async()=>{
 const seen:string[]=[];
 const h=harness({
  setStrategy:async(_u,raw)=>{seen.push(raw);return {id:'s1',userId:'u-1',version:3,rawText:raw,compiled:{minScore:70} as any,active:true,createdAt:''};},
  getStrategy:async()=>({id:'s1',userId:'u-1',version:3,rawText:'LP locked only',compiled:{minScore:70} as any,active:true,createdAt:''}),
 });
 await route(message('/edge only tokens with LP locked'),h.deps);
 assert.deepEqual(seen,['only tokens with LP locked']);
 await route(message('/edge'),h.deps);
 assert.match(h.last().text,/LP locked only/);
});

test('scan reports what was measured and says when nothing passed',async()=>{
 const h=harness({scan:async()=>[]});
 await route(message('/scan'),h.deps);
 assert.match(h.last().text,/nothing|no candidates|none/i);
 assert.doesNotMatch(h.last().text,/alpha|edge you can|prediction/i);
});

test('why names the rejections for a mint',async()=>{
 const h=harness({explain:async()=>({
  candidate:{mint:MINT,symbol:'WIF',name:'dogwifhat',launchpad:'pump.fun',creator:'C',firstSeen:'',initialBuySol:1,marketCapSol:30,uri:null},
  assessment:{mint:MINT,at:'',passed:false,rejections:['LP_NOT_LOCKED','INSIDER_CONCENTRATION'],score:0,features:{} as any},
  match:null,
 })});
 await route(message('/why '+MINT),h.deps);
 assert.match(h.last().text,/LP_NOT_LOCKED/);
 assert.match(h.last().text,/INSIDER_CONCENTRATION/);
});

test('why on an unseen mint says it was never measured',async()=>{
 const h=harness({explain:async()=>null});
 await route(message('/why '+MINT),h.deps);
 assert.match(h.last().text,/not seen|no record|never/i);
});

test('sell passes the update id through as the idempotency key',async()=>{
 const seen:string[]=[];
 const h=harness({sell:async(_u,_p,key)=>{seen.push(key);return {position:{...POSITION,status:'CLOSED'} as any,result:{ok:true,signature:'sig-2',outAmount:'9'}};}});
 await route(message('/sell '+POSITION.id,777),h.deps);
 assert.deepEqual(seen,['777']);
 assert.match(h.last().text,/sig-2/);
});

const SCAN_ROW={
 candidate:{mint:MINT,symbol:'WIF',name:'dogwifhat',launchpad:'pump.fun',creator:'C',firstSeen:new Date().toISOString(),initialBuySol:2,marketCapSol:40,uri:'ipfs://QmPic'},
 assessment:{mint:MINT,at:'',passed:true,rejections:[],score:71,features:{ageSeconds:14,holders:null,top10Pct:22,creatorLaunchCount:null,creatorGraduationCount:null,liquiditySol:31,marketCapSol:40,buyCount:null,sellCount:null,uniqueBuyers:null,mintAuthorityRevoked:true,freezeAuthorityRevoked:true}},
 match:null,
};

test('buy on a measured token confirms with its picture and its numbers',async()=>{
 const h=harness({explain:async()=>SCAN_ROW as any});
 await route(message('/buy '+MINT+' 0.25'),h.deps);
 const p=h.lastPhoto();
 assert.ok(p,'a measured token should confirm with a photo');
 assert.match(p.url,/cdn\.example/);
 assert.match(p.caption,/WIF/);
 assert.match(p.caption,/0\.25/);
 assert.match(p.caption,/71/,'the score belongs on the confirmation');
 assert.match(p.caption,/22/,'so does the concentration');
 assert.ok(p.keyboard,'the keyboard is still the commit point');
 assert.ok(p.keyboard.flat().some((b:any)=>/confirm/i.test(b.text)));
});

test('a caption never claims the token will go up',async()=>{
 const h=harness({explain:async()=>SCAN_ROW as any});
 await route(message('/buy '+MINT+' 0.25'),h.deps);
 assert.doesNotMatch(h.lastPhoto().caption,/alpha|moon|pump|gem|to the|guaranteed|will go/i);
});

test('an unmeasured token says so rather than looking measured',async()=>{
 const h=harness({explain:async()=>null});
 await route(message('/buy '+MINT+' 0.25'),h.deps);
 assert.equal(h.photos.length,0,'no picture we could not verify');
 assert.match(h.last().text,/not measured|no measurement|never/i);
 assert.ok(h.last().keyboard,'it can still be confirmed, just with eyes open');
});

test('an unreachable image falls back to text with the same facts',async()=>{
 const h=harness({explain:async()=>SCAN_ROW as any});
 h.deps.image=async()=>null;
 await route(message('/buy '+MINT+' 0.25'),h.deps);
 assert.equal(h.photos.length,0);
 assert.match(h.last().text,/WIF/);
 assert.match(h.last().text,/71/);
 assert.ok(h.last().keyboard);
});

test('why shows the picture alongside what was measured',async()=>{
 const h=harness({explain:async()=>SCAN_ROW as any});
 await route(message('/why '+MINT),h.deps);
 assert.ok(h.lastPhoto(),'why should be visual too');
 assert.match(h.lastPhoto().caption,/WIF/);
});

test('confirming still buys after the photo path',async()=>{
 const seen:string[]=[];
 const h=harness({
  explain:async()=>SCAN_ROW as any,
  buy:async(_u,_m,_s,key)=>{seen.push(key);return {position:POSITION as any,result:{ok:true,signature:'sig-1',outAmount:'1000'}};},
 });
 await route(message('/buy '+MINT+' 0.25'),h.deps);
 const confirm=h.lastPhoto().keyboard.flat().find((b:any)=>/confirm/i.test(b.text));
 await route(callback(confirm.callback_data,5150),h.deps);
 assert.deepEqual(seen,['5150']);
});

test('voice is off by default and toggles on',async()=>{
 const h=harness();
 await route(message('/voice'),h.deps);
 assert.match(h.last().text,/on\b/i);
 await route(message('/voice'),h.deps);
 assert.match(h.last().text,/off\b/i);
});

test('with voice off, nothing is ever synthesised',async()=>{
 let said=0;
 const h=harness({explain:async()=>SCAN_ROW as any});
 h.deps.voice.say=async()=>{said++;return Buffer.from('x');};
 await route(message('/buy '+MINT+' 0.25'),h.deps);
 assert.equal(said,0,'do not burn TTS on users who did not ask');
 assert.equal(h.voices.length,0);
});

test('with voice on, a buy confirmation is also spoken',async()=>{
 const h=harness({explain:async()=>SCAN_ROW as any});
 await route(message('/voice on'),h.deps);
 await route(message('/buy '+MINT+' 0.25'),h.deps);
 assert.equal(h.voices.length,1,'expected a voice note');
 assert.ok(h.lastPhoto(),'the text and picture still go out');
});

test('a silent host degrades to text instead of failing the command',async()=>{
 const h=harness({explain:async()=>SCAN_ROW as any});
 await route(message('/voice on'),h.deps);
 h.deps.voice.say=async()=>null;
 await route(message('/buy '+MINT+' 0.25'),h.deps);
 assert.equal(h.voices.length,0);
 assert.ok(h.lastPhoto(),'the confirmation must still arrive');
});

test('voice never replaces the written confirmation',async()=>{
 const h=harness({explain:async()=>SCAN_ROW as any});
 await route(message('/voice on'),h.deps);
 await route(message('/buy '+MINT+' 0.25'),h.deps);
 assert.match(h.lastPhoto().caption,/71/,'the numbers stay readable');
 assert.ok(h.lastPhoto().keyboard,'the keyboard is still the commit point');
});

const voiceNote=(update_id=3000)=>({update_id,message:{message_id:9,chat:{id:99},from:{id:99,username:'jeremy'},voice:{file_id:'AwACAgQ',duration:3}}});

test('a voice note is transcribed and echoed back before anything happens',async()=>{
 const h=harness();h.setHeard('set my limits to 0.5 sol per trade 2 sol daily for 24 hours');
 let wrote=false;
 h.deps.app.setLimits=(async()=>{wrote=true;throw Error('should not run');}) as any;
 await route(voiceNote(),h.deps);
 assert.match(h.last().text,/I heard/i);
 assert.match(h.last().text,/0\.5/,'the transcript itself must be visible');
 assert.equal(wrote,false,'nothing acts before confirmation');
 assert.ok(h.last().keyboard,'confirmation is required');
});

test('confirming a voice note runs the interpreted command',async()=>{
 const h=harness();h.setHeard('set my limits to 0.5 sol per trade 2 sol daily for 24 hours');
 const seen:unknown[]=[];
 h.deps.app.setLimits=(async(_u:string,input:unknown)=>{seen.push(input);return {userId:'u-1',maxTradeLamports:500000000n,dailyCapLamports:2000000000n,expiresAt:1789000000,active:true,policyAddress:null,agentPubkey:null};}) as any;
 await route(voiceNote(),h.deps);
 const ok=h.last().keyboard!.flat().find(b=>/confirm|yes/i.test(b.text))!;
 await route(callback(ok.callback_data,3001),h.deps);
 assert.deepEqual(seen,[{maxTradeSol:0.5,dailyCapSol:2,hours:24}]);
});

// Dollars. The demo is spoken in them; the trade underneath is still SOL.

test('a spoken dollar amount is converted and the rate is shown',async()=>{
 const h=harness();h.setSolPrice(200);
 h.setHeard('Find the best Solana meme coin and buy one hundred dollars.');
 await route(voiceNote(3100),h.deps);
 const text=h.sent.map(s=>s.text).join('\n');
 assert.match(text,/\$100/,'the amount as said');
 assert.match(text,/0\.5/,'and what it converted to');
 assert.deepEqual(h.calls.usdToSol,[[100]]);
});

test('a dollar buy still requires confirmation before it trades',async()=>{
 let traded=false;
 const h=harness({buy:async()=>{traded=true;return {position:POSITION as any,result:{ok:true,signature:'s',outAmount:'1'}};}});
 h.setHeard('buy one hundred dollars of the dumbest memecoin');
 await route(voiceNote(3101),h.deps);
 assert.equal(traded,false,'a spoken dollar amount must not skip the keyboard');
 assert.ok(h.last().keyboard,'confirmation is required');
});

test('confirming a dollar buy spends the converted amount, once',async()=>{
 const seen:unknown[]=[];
 const h=harness({buy:async(_u:string,_m:string,sol:number)=>{seen.push(sol);return {position:POSITION as any,result:{ok:true,signature:'s','outAmount':'1'}};}});
 h.setSolPrice(200);
 h.setHeard('buy one hundred dollars of the dumbest memecoin');
 await route(voiceNote(3102),h.deps);
 const ok=h.last().keyboard!.flat().find(b=>/confirm|yes/i.test(b.text))!;
 await route(callback(ok.callback_data,3103),h.deps);
 assert.deepEqual(seen,[0.5],'$100 at $200 a SOL');
 await route(callback(ok.callback_data,3104),h.deps);
 assert.deepEqual(seen,[0.5],'a second tap must not buy again');
});

// A rate is a divisor: without one, "$100" has no size at all.
test('no readable price refuses the trade rather than guessing a size',async()=>{
 let traded=false;
 const h=harness({buy:async()=>{traded=true;return {position:POSITION as any,result:{ok:true,signature:'s',outAmount:'1'}};}});
 h.setSolPrice(null);
 h.setHeard('Find the best Solana meme coin and buy one hundred dollars.');
 await route(voiceNote(3105),h.deps);
 assert.equal(traded,false);
 assert.match(h.last().text,/price/i);
 assert.equal(h.last().keyboard,undefined,'nothing to confirm without an amount');
});

test('a spoken SOL amount never consults the price feed',async()=>{
 const h=harness();
 h.setHeard('buy 0.05 sol of the dumbest memecoin');
 await route(voiceNote(3106),h.deps);
 assert.equal(h.calls.usdToSol,undefined,'SOL is already the unit');
});

test('cancelling a voice note does nothing at all',async()=>{
 const h=harness();h.setHeard('stop everything');
 let revoked=false;
 h.deps.app.revokeLimits=(async()=>{revoked=true;}) as any;
 await route(voiceNote(),h.deps);
 const no=h.last().keyboard!.flat().find(b=>/cancel|no/i.test(b.text))!;
 await route(callback(no.callback_data,3002),h.deps);
 assert.equal(revoked,false);
 assert.match(h.last().text,/cancel/i);
});

test('speaking again replaces the pending action instead of stacking',async()=>{
 const h=harness();h.setHeard('stop everything');
 await route(voiceNote(3010),h.deps);
 h.setHeard('set my limits to 1 sol per trade 5 sol daily for 12 hours');
 await route(voiceNote(3011),h.deps);
 const live=[...h.actionStore.values()];
 assert.equal(live.length,1,'an amended instruction supersedes the old one');
});

test('a read only ask answers directly, no confirmation theatre',async()=>{
 const h=harness();h.setHeard('show me my wallet');
 await route(voiceNote(3020),h.deps);
 assert.match(h.sent.map(s=>s.text).join('\n'),/Wa11et/,'it just answers');
});

test('speech it cannot interpret says what it heard and stops',async()=>{
 const h=harness();h.setHeard('what do you think about the market');
 await route(voiceNote(3030),h.deps);
 assert.match(h.last().text,/I heard/i);
 assert.match(h.last().text,/did not understand|didn't understand|not sure/i);
 assert.equal(h.last().keyboard,undefined,'nothing to confirm');
});

test('audio it cannot hear says so rather than going quiet',async()=>{
 const h=harness();h.setHeard(null);
 await route(voiceNote(3040),h.deps);
 assert.match(h.last().text,/could not|couldn't|cannot/i);
});

test('a spoken buy shows the full written confirmation, not a shortcut',async()=>{
 const h=harness({
  explain:async()=>SCAN_ROW as any,
  scan:async()=>[SCAN_ROW] as any,
 });
 h.setHeard('buy 0.05 sol of wif');
 await route(voiceNote(3050),h.deps);
 const shown=h.lastPhoto()?.caption??h.last().text;
 assert.match(shown,/WIF/);
 assert.match(shown,/0\.05/);
 assert.ok(h.lastPhoto()?.keyboard??h.last().keyboard,'the trade still needs its own confirm');
});

test('a spoken buy for a token the feed never saw is refused',async()=>{
 const h=harness({scan:async()=>[]});
 h.setHeard('buy 0.05 sol of nosuchtoken');
 await route(voiceNote(3060),h.deps);
 assert.match(h.last().text,/not seen|no candidate|do not know|don't know/i);
 assert.equal(h.photos.length,0);
});

const TRENDING=[{
 mint:MINT,symbol:'JEANJAK',name:'Jean Wojak',description:'internet-culture meme legend reborn',
 boost:500,liquiditySol:775.4,marketCapUsd:3394609,buys5m:827,sells5m:355,
 ageSeconds:25620,uri:'https://cdn.example/j.png',
}];

test('trending lists what is loud, with the numbers behind it',async()=>{
 const h=harness();
 await route(message('/trending'),h.deps);
 const t=h.last().text;
 assert.match(t,/JEANJAK/);
 assert.match(t,/827/,'trade counts are the point');
 assert.ok(t.includes(MINT),'the mint must be copyable for /buy');
});

test('trending says plainly that a boost is paid placement',async()=>{
 const h=harness();
 await route(message('/trending'),h.deps);
 assert.match(h.last().text,/paid|promot|placement/i,
  'presenting a paid boost as organic interest would be a lie');
});

test('an empty trending list says so',async()=>{
 const h=harness({trending:async()=>[]});
 await route(message('/trending'),h.deps);
 assert.match(h.last().text,/nothing|none|no trending/i);
});

test('buying the trending one resolves it and uses the normal confirmation',async()=>{
 const h=harness({explain:async()=>SCAN_ROW as any});
 h.setHeard('buy 0.05 sol of the dumbest memecoin on x');
 await route(voiceNote(4100),h.deps);
 const shown=h.lastPhoto()?.caption??h.last().text;
 assert.match(shown,/0\.05/);
 assert.ok(h.lastPhoto()?.keyboard??h.last().keyboard,'it still needs confirming');
});

test('buying the trending one when nothing is trending is refused',async()=>{
 const h=harness({trending:async()=>[]});
 h.setHeard('buy 0.05 sol of the dumbest memecoin');
 await route(voiceNote(4101),h.deps);
 assert.match(h.last().text,/nothing|none|no trending/i);
 assert.equal(h.photos.length,0);
});

test('the transcript is echoed before a trending buy, like any other',async()=>{
 const h=harness({explain:async()=>SCAN_ROW as any});
 h.setHeard('buy 0.05 sol of whatever is trending');
 await route(voiceNote(4102),h.deps);
 assert.match(h.sent.map(x=>x.text).join('\n'),/I heard/i);
});

// Telegram fetches the image itself and a pump.fun token's metadata usually
// points at IPFS it cannot reach. Losing the picture must not lose the trade.
test('a buy still confirms when telegram cannot fetch the image',async()=>{
 const h=harness();
 h.deps.image=(async()=>'https://ipfs.example/unreachable.png') as any;
 h.deps.out.photo=(async()=>{throw Error('TELEGRAM_HTTP_400: wrong file identifier');}) as any;
 await route(message('/buy '+MINT+' 0.05'),h.deps);
 const last=h.last();
 assert.ok(last,'nothing was sent at all');
 assert.match(last.text,new RegExp(MINT),'the confirmation was lost with the image');
 assert.ok(last.keyboard?.flat().some(b=>/confirm/i.test(b.text)),
  'no confirm button, so the trade cannot proceed');
});

test('a working image still shows as a photo',async()=>{
 const h=harness({
  explain:async()=>({
   candidate:{mint:MINT,symbol:'WIF',name:'WIF',launchpad:'pump.fun',creator:'c',
    firstSeen:new Date().toISOString(),initialBuySol:1,marketCapSol:10,
    uri:'ipfs://meta'},
   assessment:{passed:true,score:70,rejections:[],features:{},flow:{uniqueBuyers:2,netSol:1}},
  } as any),
 });
 h.deps.image=(async()=>'https://cdn.example/ok.png') as any;
 await route(message('/buy '+MINT+' 0.05'),h.deps);
 assert.equal(h.photos.length,1,'expected the photo path');
 assert.equal(h.sent.length,0,'should not also send text');
});
