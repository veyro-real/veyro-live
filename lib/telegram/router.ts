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
import type * as app from '../app';
import type {InlineKeyboard,TelegramUpdate} from './types';
import {parseCommand} from './parse';
import * as render from './render';

/** The part of lib/app the Telegram channel is allowed to call. */
export type AppSurface=Pick<typeof app,
 'ensureUser'|'ensureWallet'|'setLimits'|'getLimits'|'revokeLimits'|
 'setStrategy'|'getStrategy'|'scan'|'explain'|'buy'|'sell'|'positions'|
 'reconcilePositions'>;

export type Sent={chatId:string;text:string;keyboard?:InlineKeyboard};

export type Outbox={
 send(chatId:string,text:string,keyboard?:InlineKeyboard):Promise<void>;
 answer(callbackQueryId:string,text?:string):Promise<void>;
};

/** A buy the user has been shown but has not yet confirmed. */
export type PendingBuy={userId:string;chatId:string;mint:string;sol:number};

export type PendingStore={
 put(id:string,value:PendingBuy):Promise<void>;
 /** Returns the record and removes it. A second take must return null. */
 take(id:string):Promise<PendingBuy|null>;
};

export type Deps={app:AppSurface;out:Outbox;pending:PendingStore};

const CONFIRM='b:',CANCEL='x:';

export async function route(update:TelegramUpdate,deps:Deps):Promise<void>{
 try{
  if(update.callback_query)return await onCallback(update,deps);
  const message=update.message;
  if(!message?.text)return;
  return await onMessage(update,deps);
 }catch(e){
  const chatId=chatOf(update);
  if(!chatId)return;
  // Never rethrow: the webhook owes Telegram a 200 either way.
  try{await deps.out.send(chatId,'That failed: '+(e as Error).message);}catch{}
 }
}

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
 if(command.kind==='start'){
  return void await send(
   'Veyro trades Solana memecoins from a wallet this bot controls for you.\n\n'+
   render.CUSTODY+'\n\n'+
   'Set your limits with /limits before anything can be spent, then /wallet for '+
   'your deposit address. /help lists the rest.');
 }
 if(command.kind==='connect'){
  return void await send('Linking an x.com account is not available yet. Everything else works without it.');
 }

 const user=await deps.app.ensureUser(chatId,message.from?.username??null);

 switch(command.kind){
  case 'wallet':{
   const w=await deps.app.ensureWallet(user.id);
   return void await send(
    'Your deposit address:\n'+w.pubkey+'\n\n'+
    'Balance: '+render.sol(w.lamports)+' SOL\n\n'+render.CUSTODY);
  }
  case 'limits':{
   if(command.set===null)return void await send(render.limits(await deps.app.getLimits(user.id)));
   const l=await deps.app.setLimits(user.id,command.set);
   return void await send('Limits set.\n\n'+render.limits(l));
  }
  case 'revoke':{
   await deps.app.revokeLimits(user.id);
   return void await send('Spending is revoked. Nothing can be spent until you set /limits again.');
  }
  case 'edge':{
   if(command.text===null){
    const s=await deps.app.getStrategy(user.id);
    return void await send(s?('Your strategy, version '+s.version+':\n\n'+s.rawText):'You have no strategy yet. Describe one with /edge <plain English>.');
   }
   const s=await deps.app.setStrategy(user.id,command.text);
   return void await send('Strategy saved as version '+s.version+'.\n\n'+s.rawText);
  }
  case 'scan':return void await send(render.scan(await deps.app.scan(user.id,command.limit)));
  case 'why':return void await send(render.why(await deps.app.explain(command.mint),command.mint));
  case 'positions':{
   await deps.app.reconcilePositions(user.id);
   return void await send(render.positions(await deps.app.positions(user.id,command.includeClosed)));
  }
  case 'sell':{
   const outcome=await deps.app.sell(user.id,command.positionId,key);
   return void await send(report(outcome,'Sold'));
  }
  case 'buy':{
   // The commit point is the keyboard, not this message.
   const id=randomBytes(6).toString('hex');
   await deps.pending.put(id,{userId:user.id,chatId,mint:command.mint,sol:command.sol});
   return void await send(
    'Buy '+command.sol+' SOL of\n'+command.mint+'?\n\n'+
    'This spends real funds and cannot be undone.',
    [[{text:'Confirm buy',callback_data:CONFIRM+id},{text:'Cancel',callback_data:CANCEL+id}]]);
  }
 }
}

async function onCallback(update:TelegramUpdate,deps:Deps):Promise<void>{
 const q=update.callback_query!;
 const chatId=q.message?.chat.id===undefined?null:String(q.message.chat.id);
 await deps.out.answer(q.id);
 if(!chatId||!q.data)return;
 const send=(text:string)=>deps.out.send(chatId,text);

 const id=q.data.slice(2);
 if(q.data.startsWith(CANCEL)){
  await deps.pending.take(id);
  return void await send('Cancelled. Nothing was spent.');
 }
 if(!q.data.startsWith(CONFIRM))return;

 // Consuming the record here is what makes a replayed tap safe. The
 // update_id passed to buy() is the second guard, inside the money path.
 const p=await deps.pending.take(id);
 if(!p)return void await send('That confirmation expired or was already used. Send /buy again.');
 const outcome=await deps.app.buy(p.userId,p.mint,p.sol,String(update.update_id));
 return void await send(report(outcome,'Bought'));
}

function report(outcome:app.TradeOutcome,verb:string):string{
 const {position,result}=outcome;
 if(!result.ok)return render.denial(result.reason);
 return [
  verb+' '+position.symbol+'.',
  'Signature: '+result.signature,
  'Position: '+position.id,
 ].join('\n');
}
