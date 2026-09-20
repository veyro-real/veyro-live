// The Telegram webhook, separated from the Next.js route so it can be tested
// without a server, a bot token or a database.
//
// Three things this file exists to get right.
//
// 1. validateOrigin() from lib/auth is NOT used here. Telegram is a
//    third-party caller and would always fail it. The secret token is the
//    authentication instead, compared in constant time.
// 2. update_id is claimed before anything is routed. Telegram retries a
//    webhook it thinks failed, and a redelivered /buy must not open a second
//    position.
// 3. Once the caller is authenticated, every answer is 200. A non-2xx makes
//    Telegram retry the same update indefinitely.

import {createHash,timingSafeEqual} from 'node:crypto';
import type {TelegramUpdate} from './types';

export type WebhookDeps={
 secret:string;
 /** True the first time this update_id is seen, false on redelivery. */
 claimUpdate(updateId:number):Promise<boolean>;
 route(update:TelegramUpdate):Promise<void>;
};

/** Telegram updates are small; anything larger is not one. */
const MAX_BODY=65536;

/** Constant time, and safe for inputs of different lengths. */
function sameSecret(a:string,b:string):boolean{
 const ha=createHash('sha256').update(a,'utf8').digest();
 const hb=createHash('sha256').update(b,'utf8').digest();
 return timingSafeEqual(ha,hb);
}

async function readCapped(req:Request):Promise<string|null>{
 if(Number(req.headers.get('content-length')||0)>MAX_BODY)return null;
 const reader=req.body?.getReader();
 if(!reader)return '';
 const decoder=new TextDecoder();
 let text='',total=0;
 for(;;){
  const {value,done}=await reader.read();
  if(done)break;
  total+=value.length;
  if(total>MAX_BODY){await reader.cancel();return null;}
  text+=decoder.decode(value,{stream:true});
 }
 return text+decoder.decode();
}

const ok=()=>new Response('',{status:200,headers:{'Cache-Control':'no-store'}});

export async function handleUpdate(req:Request,deps:WebhookDeps):Promise<Response>{
 // Fail closed. An unset secret must never mean "accept an empty header".
 if(!deps.secret||deps.secret.length<32){
  return new Response('WEBHOOK_NOT_CONFIGURED',{status:503});
 }
 const presented=req.headers.get('x-telegram-bot-api-secret-token');
 if(presented===null||!sameSecret(presented,deps.secret)){
  return new Response('UNAUTHORIZED',{status:401});
 }

 const raw=await readCapped(req);
 if(raw===null)return new Response('REQUEST_TOO_LARGE',{status:413});

 let update:TelegramUpdate;
 try{
  update=JSON.parse(raw) as TelegramUpdate;
 }catch{
  return ok(); // Not something Telegram sent. Dropping it is the fix.
 }
 if(!Number.isSafeInteger(update?.update_id))return ok();

 // If we cannot prove this is the first delivery, do not route it. A
 // non-2xx makes Telegram retry, which is the safe direction: a duplicate
 // /buy is caught downstream, a dropped one is simply lost.
 let first:boolean;
 try{
  first=await deps.claimUpdate(update.update_id);
 }catch{
  return new Response('DEDUPE_UNAVAILABLE',{status:503});
 }
 if(!first)return ok();

 try{
  await deps.route(update);
 }catch{
  // route() already reports failures to the user. Swallowing here only
  // stops Telegram from redelivering an update we have already consumed.
 }
 return ok();
}
