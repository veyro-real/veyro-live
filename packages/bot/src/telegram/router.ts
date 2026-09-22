// Dispatch one Telegram update. Everything the bot can do goes through the
// frozen surface in lib/app; this file never reaches into lib/trade,
// lib/wallet or lib/market directly.
//
// Two rules hold here.
//
// 1. /buy never trades. It writes a pending confirmation and shows a keyboard.
//    Only the callback from that keyboard reaches app.buy, and the pending
//    record is consumed when it does, so a replayed tap cannot buy twice.
// 2. Nothing throws out of route(). The webhook must answer 200 to every
//    update Telegram sends, or Telegram retries it forever.

import {randomBytes} from 'node:crypto';
import type {InlineKeyboard,TelegramUpdate} from './types';
import {parseCommand,type Command} from './parse';
import {intentFromSpeech,refusalFor,type Intent} from './intent';
import type * as app from '../app';
import * as render from './render';
import {WHY} from './render';
import {ACTION,ACTION_NO,CANCEL,CONFIRM,FUNDED,report,runCommand,type Ctx} from './handlers';
import {stepAction,stepMessage,TUTORIAL,TUTORIAL_DO} from './tutorial';
import {onrampLink} from '../fund/moonpay';
import {pickTrending,TRENDING_POOL} from '../trade/pick-trending';

/** The part of lib/app the Telegram channel is allowed to call. */
import type {
 AppSurface,Deps,Outbox,PendingAction,PendingActionStore,PendingBuy,Sent,
} from './ports';
export type {AppSurface,Deps,Outbox,PendingAction,PendingActionStore,PendingBuy,Sent};



/**
 * A spoken amount as SOL, with the conversion to show alongside it.
 *
 * The user said one number and the confirmation is about to show a different
 * one, so the rate is stated rather than applied silently. Null means no rate
 * could be read, which is a refusal and never a fallback amount.
 */
async function amountSol(
 intent:{sol:number}|{usd:number},deps:Deps,
):Promise<{sol:number;note:string}|null>{
 if(!('usd' in intent))return {sol:intent.sol,note:''};
 const sol=await deps.usdToSol(intent.usd);
 if(sol===null)return null;
 return {sol,note:'\n\n$'+intent.usd+' is about '+sol.toFixed(4)+' SOL at the current rate.'};
}

/** Spoken asks that change nothing, so they need no confirmation. */
const readOnly=(i:Intent):boolean=>
 i.kind==='wallet'||i.kind==='positions'||i.kind==='scan'||i.kind==='help'||
 i.kind==='trending'||
 (i.kind==='limits'&&i.set===null)||(i.kind==='edge'&&i.text===null);

export async function route(update:TelegramUpdate,deps:Deps):Promise<void>{
 try{
  if(update.callback_query)return await onCallback(update,deps);
  const message=update.message;
  if(message?.voice)return await onVoice(update,deps);
  if(!message?.text)return;
  return await onMessage(update,deps);
 }catch(e){
  const chatId=chatOf(update);
  if(!chatId)return;
  // Never rethrow: the webhook owes Telegram a 200 either way.
  try{await deps.out.send(chatId,render.failure((e as Error).message));}catch{}
 }
}

/** Everything a handler needs, assembled once per dispatch. */
const ctx=(userId:string,chatId:string,key:string,deps:Deps):Ctx=>({
 userId,chatId,key,deps,
 send:(text,keyboard)=>deps.out.send(chatId,text,keyboard),
});

const chatOf=(u:TelegramUpdate):string|null=>{
 const id=u.message?.chat.id??u.callback_query?.message?.chat.id;
 return id===undefined?null:String(id);
};

async function onMessage(update:TelegramUpdate,deps:Deps):Promise<void>{
 const message=update.message!;
 const chatId=String(message.chat.id);
 const key=String(update.update_id);
 const command=parseCommand(message.text!);
 const send=(text:string,keyboard?:InlineKeyboard)=>deps.out.send(chatId,text,keyboard);

 if(command.kind==='unknown')return void await send('I did not recognise that. /help lists what I answer.');
 if(command.kind==='usage')return void await send(render.usage(command.command));
 if(command.kind==='help')return void await send(render.help());
 // /start is the first thing anyone sends, so it opens the walkthrough
 // rather than describing one. Step one is the custody disclosure, which is
 // what has to be read before a deposit either way.
 if(command.kind==='start'||command.kind==='tutorial'){
  const first=stepMessage(0);
  return void await send(first.text,first.keyboard);
 }
 if(command.kind==='chatid'){
  return void await send('Chat id: '+chatId+'\n\nSet VEYRO_ALERT_CHAT_ID to this to receive feed alerts here.');
 }
 if(command.kind==='connect'){
  return void await send('Linking an x.com account is not available yet. Everything else works without it.');
 }


 const user=await deps.app.ensureUser(chatId,message.from?.username??null);
 // A typed instruction supersedes anything spoken and left unconfirmed.
 await deps.pendingAction.clear(user.id);
 return runCommand(command,ctx(user.id,chatId,key,deps));
}

/** Everything a command does once we know who is asking. Shared by typed
 *  commands and by confirmed spoken ones. */
async function onCallback(update:TelegramUpdate,deps:Deps):Promise<void>{
 const q=update.callback_query!;
 const chatId=q.message?.chat.id===undefined?null:String(q.message.chat.id);
 // Only dismisses the spinner on the button. Its id expires after about a
 // minute, so a tap that lands during a redeploy fails it — and because this
 // was awaited before the work, the failure threw, the tap was lost, and the
 // user got a raw Telegram error instead of their trade. Cosmetics must never
 // cost someone a confirmed action.
 await deps.out.answer(q.id).catch(()=>{});
 if(!chatId||!q.data)return;
 // Takes a keyboard: a callback can answer with one, and a funding offer is
 // useless without its buttons.
 const send=(text:string,keyboard?:InlineKeyboard)=>deps.out.send(chatId,text,keyboard);

 const id=q.data.slice(2);

 // A walkthrough screen's action button, run as if the reader had typed it.
 // The reply is a new message so the tour stays where it was.
 if(q.data.startsWith(TUTORIAL_DO)){
  const command=stepAction(Number(id));
  if(!command)return;
  const user=await deps.app.ensureUser(chatId,q.from.username??null);
  return runCommand(command,ctx(user.id,chatId,String(update.update_id),deps));
 }

 // Walkthrough navigation. Read-only, so it needs no user record and no
 // confirmation; it edits the one message rather than sending another.
 if(q.data.startsWith(TUTORIAL)){
  const step=stepMessage(Number(id));
  const messageId=q.message?.message_id;
  if(messageId===undefined)return void await send(step.text);
  return void await deps.out.edit(chatId,messageId,step.text,step.keyboard);
 }

 // "Why $TOKEN" from a /scan list. Read-only, but it needs a user record
 // because every command runs as somebody.
 if(q.data.startsWith(WHY)){
  const user=await deps.app.ensureUser(chatId,q.from.username??null);
  return runCommand({kind:'why',mint:id},ctx(user.id,chatId,String(update.update_id),deps));
 }

 // A spoken instruction awaiting confirmation.
 if(q.data.startsWith(ACTION_NO)){
  await deps.pendingAction.take(id);
  return void await send('Cancelled. Nothing was done.');
 }
 if(q.data.startsWith(ACTION)){
  const pending=await deps.pendingAction.take(id);
  if(!pending)return void await send('That instruction expired or was already handled. Say it again.');
  return runCommand(pending.intent as Command,ctx(pending.userId,pending.chatId,String(update.update_id),deps));
 }

 if(q.data.startsWith(CANCEL)){
  await deps.pending.take(id);
  return void await send('Cancelled. Nothing was spent.');
 }
 // "I have funded it" on a trade that was held for want of SOL. The record
 // was put back when we offered to hold it, so this is an ordinary buy.
 if(q.data.startsWith(FUNDED)){
  const held=await deps.pending.take(id);
  if(!held)return void await send('That trade is no longer held. Say it again.');
  return void await settleBuy(held,update,deps,send);
 }

 if(!q.data.startsWith(CONFIRM))return;

 // Consuming the record here is what makes a replayed tap safe. The
 // update_id passed to buy() is the second guard, inside the money path.
 const p=await deps.pending.take(id);
 if(!p)return void await send('That confirmation expired or was already used. Send /buy again.');
 return void await settleBuy(p,update,deps,send);
}

/**
 * Runs a confirmed buy and answers for it.
 *
 * Being short of SOL is the one refusal that is not the end of the
 * conversation: the user has already said what they want and tapped to
 * authorise it, so the trade is held and they are given the address, the
 * amount and a way to pay. Every other refusal is reported as it is.
 */
/** Enough for a run of small trades, so funding is not a per-trade chore. */
const SUGGESTED_TOPUP_USD=20;

async function settleBuy(
 p:PendingBuy,update:TelegramUpdate,deps:Deps,send:(t:string,k?:InlineKeyboard)=>Promise<void>,
):Promise<void>{
 const outcome=await deps.app.buy(p.userId,p.mint,p.sol,String(update.update_id));
 if(outcome.result.ok||outcome.result.reason!=='INSUFFICIENT_BALANCE'){
  return void await send(report(outcome,'Bought'));
 }

 // Hold it under a fresh id so the funding tap can finish it later.
 const again=randomBytes(6).toString('hex');
 await deps.pending.put(again,p);
 const w=await deps.app.ensureWallet(p.userId);
 const {text,keyboard}=render.needsFunding({
  pubkey:w.pubkey,
  haveLamports:BigInt(w.lamports??'0'),
  needLamports:BigInt(Math.round(p.sol*1e9)),
  symbol:outcome.position.symbol||null,
  retryData:FUNDED+again,
  // Suggest a round figure worth several trades rather than the exact
  // shortfall: topping up to the lamport means funding again next time.
  onramp:onrampLink({pubkey:w.pubkey,usdAmount:SUGGESTED_TOPUP_USD}),
 });
 return void await send(text,keyboard);
}


/**
 * A voice note. Nothing spoken ever acts straight away unless it changes
 * nothing: the transcript is always shown back first, and anything that
 * writes or spends waits for a tap. Saying it again replaces what was
 * pending, so a misheard instruction is amended rather than cancelled.
 */
async function onVoice(update:TelegramUpdate,deps:Deps):Promise<void>{
 const message=update.message!;
 const chatId=String(message.chat.id);
 const key=String(update.update_id);
 const send=(text:string,keyboard?:InlineKeyboard)=>deps.out.send(chatId,text,keyboard);

 const transcript=await deps.voice.hear(message.voice!.file_id);
 if(!transcript){
  return void await send('I could not make that out. Say it again, or type it.');
 }

 const user=await deps.app.ensureUser(chatId,message.from?.username??null);
 await deps.pendingAction.clear(user.id);

 const heard='I heard: "'+transcript+'"';
 const intent=intentFromSpeech(transcript);
 if(!intent){
  // Understood and declined is not the same as not understood, and saying
  // the second when the first is true leaves someone retrying a phrasing
  // that was never going to work.
  const why=refusalFor(transcript);
  return void await send(heard+'\n\n'+
   (why??'I did not understand it. /help lists what I answer.'));
 }

 if(readOnly(intent)){
  await send(heard);
  return runCommand(intent as Command,ctx(user.id,chatId,key,deps));
 }

 if(intent.kind==='buyTrending'||intent.kind==='buyBySymbol'){
  // Nobody speaks in lamports, so a dollar amount is converted here, once,
  // and everything downstream is an ordinary SOL-denominated trade.
  const priced=await amountSol(intent,deps);
  if(priced===null){
   return void await send(heard+'\n\nI could not read a SOL price just now, so I '+
    'do not know what that is in SOL. Say an amount in SOL, or try again shortly.');
  }
  const {sol,note}=priced;

  if(intent.kind==='buyTrending'){
   // No symbol was named, so pick one of the loud ones. Not the loudest:
   // that is the same token every time, and once held it refuses every later
   // buy with POSITION_ALREADY_OPEN. A boost is paid placement anyway, so
   // the top of the list is who spent most on visibility, not a judgement.
   const rows=await deps.app.trending(TRENDING_POOL);
   if(rows.length===0){
    return void await send(heard+'\n\nNothing is trending right now, so there is '+
     'nothing for me to pick. Try /trending in a moment.');
   }
   const held=(await deps.app.positions(user.id,false)).map(p=>p.mint);
   const choice=pickTrending(rows,held);
   if(!choice){
    return void await send(heard+'\n\nYou already hold every token I would '+
     'have picked from. /positions shows them, and /sell closes one.');
   }
   await send(heard+note+'\n\nPicked '+choice.symbol+' at random out of the '+
    rows.length+' loudest right now. Loud means paid placement, not a verdict.');
   return runCommand({kind:'buy',mint:choice.mint,sol},ctx(user.id,chatId,key,deps));
  }

  // A 44-character mint cannot be dictated, so a spoken buy names a symbol
  // and we resolve it against what the feed has actually seen.
  const rows=await deps.app.scan(user.id,25);
  const hit=rows.find(r=>r.candidate.symbol.toLowerCase()===intent.symbol.toLowerCase());
  if(!hit){
   return void await send(heard+'\n\nI have not seen a candidate called '+intent.symbol+
    '. /scan lists what passed the filter.');
  }
  await send(heard+note);
  // Falls into the normal buy path, so the trade keeps its own confirmation.
  return runCommand({kind:'buy',mint:hit.candidate.mint,sol},ctx(user.id,chatId,key,deps));
 }

 const id=randomBytes(6).toString('hex');
 await deps.pendingAction.put(id,{userId:user.id,chatId,intent,transcript});
 return void await send(
  heard+'\n\n'+render.describeIntent(intent)+'\n\nConfirm, or say it again to change it.',
  [[{text:'Confirm',callback_data:ACTION+id},{text:'Cancel',callback_data:ACTION_NO+id}]]);
}
