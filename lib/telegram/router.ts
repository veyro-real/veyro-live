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
import {parseCommand,type Command} from './parse';
import {intentFromSpeech,type Intent} from './intent';
import * as render from './render';
import {spokenConfirm} from '../voice/speech';

/** The part of lib/app the Telegram channel is allowed to call. */
export type AppSurface=Pick<typeof app,
 'ensureUser'|'ensureWallet'|'setLimits'|'getLimits'|'revokeLimits'|
 'setStrategy'|'getStrategy'|'scan'|'explain'|'buy'|'sell'|'positions'|
 'reconcilePositions'>;

export type Sent={chatId:string;text:string;keyboard?:InlineKeyboard};

export type Outbox={
 send(chatId:string,text:string,keyboard?:InlineKeyboard):Promise<void>;
 answer(callbackQueryId:string,text?:string):Promise<void>;
 /** Telegram fetches the url itself; we never download the bytes. */
 photo(chatId:string,imageUrl:string,caption:string,keyboard?:InlineKeyboard):Promise<void>;
 /** OGG/Opus bytes, uploaded as a Telegram voice note. */
 voiceNote(chatId:string,ogg:Buffer):Promise<void>;
};

/** A buy the user has been shown but has not yet confirmed. */
export type PendingBuy={userId:string;chatId:string;mint:string;sol:number};

export type PendingStore={
 put(id:string,value:PendingBuy):Promise<void>;
 /** Returns the record and removes it. A second take must return null. */
 take(id:string):Promise<PendingBuy|null>;
};

/** A spoken instruction awaiting confirmation. */
export type PendingAction={userId:string;chatId:string;intent:Intent;transcript:string};

export type PendingActionStore={
 put(id:string,value:PendingAction):Promise<void>;
 take(id:string):Promise<PendingAction|null>;
 /** Drop anything this user had pending; a new instruction supersedes. */
 clear(userId:string):Promise<void>;
};

export type Deps={
 app:AppSurface;
 out:Outbox;
 pending:PendingStore;
 /** Token metadata uri to a displayable image url, or null. */
 image(uri:string|null):Promise<string|null>;
 voice:{
  enabled(userId:string):Promise<boolean>;
  setEnabled(userId:string,on:boolean):Promise<void>;
  /** OGG/Opus bytes, or null when this host cannot synthesise. */
  say(text:string):Promise<Buffer|null>;
  /** A voice note's transcript, or null when it could not be heard. */
  hear(fileId:string):Promise<string|null>;
 };
 pendingAction:PendingActionStore;
};

const CONFIRM='b:',CANCEL='x:',ACTION='a:',ACTION_NO='n:';

/** Spoken asks that change nothing, so they need no confirmation. */
const readOnly=(i:Intent):boolean=>
 i.kind==='wallet'||i.kind==='positions'||i.kind==='scan'||i.kind==='help'||
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
 if(command.kind==='chatid'){
  return void await send('Chat id: '+chatId+'\n\nSet VEYRO_ALERT_CHAT_ID to this to receive feed alerts here.');
 }
 if(command.kind==='connect'){
  return void await send('Linking an x.com account is not available yet. Everything else works without it.');
 }


 const user=await deps.app.ensureUser(chatId,message.from?.username??null);
 // A typed instruction supersedes anything spoken and left unconfirmed.
 await deps.pendingAction.clear(user.id);
 return runCommand(command,user.id,chatId,key,deps);
}

/** Everything a command does once we know who is asking. Shared by typed
 *  commands and by confirmed spoken ones. */
async function runCommand(
 command:Command,userId:string,chatId:string,key:string,deps:Deps,
):Promise<void>{
 const send=(text:string,keyboard?:InlineKeyboard)=>deps.out.send(chatId,text,keyboard);
 switch(command.kind){
  case 'wallet':{
   const w=await deps.app.ensureWallet(userId);
   return void await send(
    'Your deposit address:\n'+w.pubkey+'\n\n'+
    'Balance: '+render.sol(w.lamports)+' SOL\n\n'+render.CUSTODY);
  }
  case 'limits':{
   if(command.set===null)return void await send(render.limits(await deps.app.getLimits(userId)));
   const l=await deps.app.setLimits(userId,command.set);
   return void await send('Limits set.\n\n'+render.limits(l));
  }
  case 'revoke':{
   await deps.app.revokeLimits(userId);
   return void await send('Spending is revoked. Nothing can be spent until you set /limits again.');
  }
  case 'edge':{
   if(command.text===null){
    const s=await deps.app.getStrategy(userId);
    return void await send(s?('Your strategy, version '+s.version+':\n\n'+s.rawText):'You have no strategy yet. Describe one with /edge <plain English>.');
   }
   const s=await deps.app.setStrategy(userId,command.text);
   return void await send('Strategy saved as version '+s.version+'.\n\n'+s.rawText);
  }
  case 'voice':{
   const on=command.on??!await deps.voice.enabled(userId);
   await deps.voice.setEnabled(userId,on);
   return void await send(on
    ?'Voice notes on. I will speak confirmations as well as writing them.'
    :'Voice notes off.');
  }
  case 'scan':return void await send(render.scan(await deps.app.scan(userId,command.limit)));
  case 'why':{
   const row=await deps.app.explain(command.mint);
   const text=render.why(row,command.mint);
   const image=row?await deps.image(row.candidate.uri):null;
   if(!image)return void await send(text);
   // Telegram caps a caption at 1024 characters; the rest follows as text.
   await deps.out.photo(chatId,image,text.slice(0,1000));
   if(text.length>1000)await send(text.slice(1000));
   return;
  }
  case 'positions':{
   await deps.app.reconcilePositions(userId);
   return void await send(render.positions(await deps.app.positions(userId,command.includeClosed)));
  }
  case 'sell':{
   const outcome=await deps.app.sell(userId,command.positionId,key);
   return void await send(report(outcome,'Sold'));
  }
  case 'buy':{
   // The commit point is the keyboard, not this message.
   const id=randomBytes(6).toString('hex');
   await deps.pending.put(id,{userId:userId,chatId,mint:command.mint,sol:command.sol});
   const keyboard:InlineKeyboard=
    [[{text:'Confirm buy',callback_data:CONFIRM+id},{text:'Cancel',callback_data:CANCEL+id}]];
   // Show what is being bought. A token we never measured says so instead
   // of borrowing the look of one we did.
   const row=await deps.app.explain(command.mint);
   const caption=render.confirm(command.mint,command.sol,row);
   const image=row?await deps.image(row.candidate.uri):null;
   if(image)await deps.out.photo(chatId,image,caption,keyboard);
   else await send(caption,keyboard);
   // Spoken afterwards, never instead. The written confirmation and its
   // keyboard are the commit point; audio is an extra.
   if(await deps.voice.enabled(userId)){
    const ogg=await deps.voice.say(spokenConfirm(command.sol,row,command.mint));
    if(ogg)await deps.out.voiceNote(chatId,ogg);
   }
   return;
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

 // A spoken instruction awaiting confirmation.
 if(q.data.startsWith(ACTION_NO)){
  await deps.pendingAction.take(id);
  return void await send('Cancelled. Nothing was done.');
 }
 if(q.data.startsWith(ACTION)){
  const pending=await deps.pendingAction.take(id);
  if(!pending)return void await send('That instruction expired or was already handled. Say it again.');
  return runCommand(pending.intent as Command,pending.userId,pending.chatId,String(update.update_id),deps);
 }

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
  return void await send(heard+'\n\nI did not understand it. /help lists what I answer.');
 }

 if(readOnly(intent)){
  await send(heard);
  return runCommand(intent as Command,user.id,chatId,key,deps);
 }

 if(intent.kind==='buyBySymbol'){
  // A 44-character mint cannot be dictated, so a spoken buy names a symbol
  // and we resolve it against what the feed has actually seen.
  const rows=await deps.app.scan(user.id,25);
  const hit=rows.find(r=>r.candidate.symbol.toLowerCase()===intent.symbol.toLowerCase());
  if(!hit){
   return void await send(heard+'\n\nI have not seen a candidate called '+intent.symbol+
    '. /scan lists what passed the filter.');
  }
  await send(heard);
  // Falls into the normal buy path, so the trade keeps its own confirmation.
  return runCommand({kind:'buy',mint:hit.candidate.mint,sol:intent.sol},user.id,chatId,key,deps);
 }

 const id=randomBytes(6).toString('hex');
 await deps.pendingAction.put(id,{userId:user.id,chatId,intent,transcript});
 return void await send(
  heard+'\n\n'+render.describeIntent(intent)+'\n\nConfirm, or say it again to change it.',
  [[{text:'Confirm',callback_data:ACTION+id},{text:'Cancel',callback_data:ACTION_NO+id}]]);
}
