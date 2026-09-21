import test from 'node:test';import assert from 'node:assert/strict';
const {handleUpdate}=await import('../lib/telegram/webhook');
import type {WebhookDeps} from '../lib/telegram/webhook';

const SECRET='s'.repeat(40);

function harness(over:Partial<WebhookDeps>={}){
 const routed:number[]=[];const claimed:number[]=[];
 const deps:WebhookDeps={
  secret:SECRET,
  claimUpdate:async(id)=>{claimed.push(id);return !claimed.slice(0,-1).includes(id);},
  route:async(u)=>{routed.push(u.update_id);},
  ...over,
 };
 return {deps,routed,claimed};
}

const post=(body:unknown,secret?:string)=>new Request('https://veyro.example/api/telegram/webhook',{
 method:'POST',
 headers:{
  'content-type':'application/json',
  ...(secret===undefined?{}:{'x-telegram-bot-api-secret-token':secret}),
  origin:'https://api.telegram.org',
 },
 body:typeof body==='string'?body:JSON.stringify(body),
});

const update=(id:number)=>({update_id:id,message:{message_id:1,chat:{id:99},from:{id:99},text:'/help'}});

test('a valid update is routed once and answered 200',async()=>{
 const h=harness();
 const res=await handleUpdate(post(update(1),SECRET),h.deps);
 assert.equal(res.status,200);
 assert.deepEqual(h.routed,[1]);
});

test('a missing secret header is rejected and never routed',async()=>{
 const h=harness();
 const res=await handleUpdate(post(update(1)),h.deps);
 assert.equal(res.status,401);
 assert.deepEqual(h.routed,[]);
});

test('a wrong secret is rejected, including one of a different length',async()=>{
 for(const bad of ['x'.repeat(40),'','short','s'.repeat(41)]){
  const h=harness();
  const res=await handleUpdate(post(update(1),bad),h.deps);
  assert.equal(res.status,401,JSON.stringify(bad));
  assert.deepEqual(h.routed,[]);
 }
});

test('an unconfigured secret fails closed rather than accepting anything',async()=>{
 for(const secret of ['',undefined as unknown as string]){
  const h=harness({secret});
  const res=await handleUpdate(post(update(1),''),h.deps);
  assert.equal(res.status,503);
  assert.deepEqual(h.routed,[]);
 }
});

test('a redelivered update is accepted but not routed a second time',async()=>{
 const h=harness();
 assert.equal((await handleUpdate(post(update(7),SECRET),h.deps)).status,200);
 assert.equal((await handleUpdate(post(update(7),SECRET),h.deps)).status,200);
 assert.deepEqual(h.routed,[7],'a replayed /buy must not run twice');
 assert.deepEqual(h.claimed,[7,7]);
});

test('dedupe happens before routing, not after',async()=>{
 const order:string[]=[];
 const h=harness({
  claimUpdate:async()=>{order.push('claim');return true;},
  route:async()=>{order.push('route');},
 });
 await handleUpdate(post(update(3),SECRET),h.deps);
 assert.deepEqual(order,['claim','route']);
});

test('a throwing router still answers 200 so Telegram stops retrying',async()=>{
 const h=harness({route:async()=>{throw Error('boom');}});
 const res=await handleUpdate(post(update(4),SECRET),h.deps);
 assert.equal(res.status,200);
});

test('an unparseable body is accepted and dropped, not retried forever',async()=>{
 const h=harness();
 const res=await handleUpdate(post('not json',SECRET),h.deps);
 assert.equal(res.status,200);
 assert.deepEqual(h.routed,[]);
});

test('a body with no update_id is dropped without claiming',async()=>{
 const h=harness();
 const res=await handleUpdate(post({message:{text:'/help'}},SECRET),h.deps);
 assert.equal(res.status,200);
 assert.deepEqual(h.claimed,[]);
 assert.deepEqual(h.routed,[]);
});

test('an oversized body is refused before it is parsed',async()=>{
 const h=harness();
 const res=await handleUpdate(post({update_id:1,padding:'p'.repeat(200000)},SECRET),h.deps);
 assert.equal(res.status,413);
 assert.deepEqual(h.routed,[]);
});

test('a dedupe failure answers 503 so Telegram retries instead of the update being lost',async()=>{
 const h=harness({claimUpdate:async()=>{throw Error('SUPABASE_NOT_CONFIGURED');}});
 const res=await handleUpdate(post(update(9),SECRET),h.deps);
 assert.equal(res.status,503);
 assert.deepEqual(h.routed,[],'nothing may be routed when we cannot prove it is the first delivery');
});
