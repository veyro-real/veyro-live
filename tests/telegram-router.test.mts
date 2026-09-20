import test from 'node:test';import assert from 'node:assert/strict';
const {route}=await import('../lib/telegram/router');
import type {Deps,Sent} from '../lib/telegram/router';

const MINT='Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';
const USER={id:'u-1',telegramChatId:'99',telegramUsername:'jeremy',walletPubkey:'Wa11et',createdAt:'2026-09-20T00:00:00Z'};
const POSITION={
 id:'6f1b8c3e-9a2d-4c55-8f0e-1b2c3d4e5f60',userId:'u-1',mint:MINT,symbol:'WIF',status:'OPEN',
 entrySignature:'sig-1',entryLamports:'250000000',tokensReceived:'1000',exitSignature:null,
 exitLamports:null,reason:'',openedAt:'2026-09-20T00:00:00Z',closedAt:null,
};

function harness(app:Partial<Deps['app']>={}){
 const sent:Sent[]=[];const answered:{id:string;text?:string}[]=[];
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
   ...app,
  } as Deps['app'],
  out:{
   send:async(chatId,text,keyboard)=>{sent.push({chatId,text,keyboard});},
   answer:async(id,text)=>{answered.push({id,text});},
  },
  pending:{
   put:async(k,v)=>{store.set(k,v);},
   take:async(k)=>{const v=store.get(k)??null;store.delete(k);return v as any;},
  },
 };
 return {deps,sent,answered,calls,last:()=>sent[sent.length-1]};
}

const message=(text:string,update_id=1)=>({update_id,message:{message_id:5,chat:{id:99},from:{id:99,username:'jeremy'},text}});
const callback=(data:string,update_id=2)=>({update_id,callback_query:{id:'cb-1',data,from:{id:99,username:'jeremy'},message:{message_id:5,chat:{id:99}}}});

test('start tells the user the service holds their keys',async()=>{
 const h=harness();
 await route(message('/start'),h.deps);
 assert.match(h.last().text,/custod|hold(s)? your (private )?keys/i);
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
