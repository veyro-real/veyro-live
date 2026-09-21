// One handler per command.
//
// Keyed on kind rather than a switch, so adding a command means adding an
// entry here instead of editing the router. Each handler gets everything it
// needs through Ctx and reaches the outside world only through deps, which
// is what keeps the router's tests free of a database.

import {randomBytes} from 'node:crypto';
import type {Command} from './parse';
import type {Deps} from './ports';
import type {InlineKeyboard} from './types';
import type * as app from '../app';
import * as render from './render';
import {spokenConfirm} from '../voice/speech';

export const CONFIRM='b:',CANCEL='x:',ACTION='a:',ACTION_NO='n:';

export type Ctx={
 userId:string;
 chatId:string;
 /** Idempotency key for anything that spends. The Telegram update_id. */
 key:string;
 deps:Deps;
 send(text:string,keyboard?:InlineKeyboard):Promise<void>;
};

type Handlers={
 [K in Command['kind']]?:(command:Extract<Command,{kind:K}>,ctx:Ctx)=>Promise<void>;
};

function report(outcome:app.TradeOutcome,verb:string):string{
 const {position,result}=outcome;
 if(!result.ok)return render.denial(result.reason);
 return [verb+' '+position.symbol+'.','Signature: '+result.signature,'Position: '+position.id].join('\n');
}

export const handlers:Handlers={
 async wallet(_c,{userId,deps,send}){
  const w=await deps.app.ensureWallet(userId);
  await send('Your deposit address:\n'+w.pubkey+'\n\n'+
   'Balance: '+render.sol(w.lamports)+' SOL\n\n'+render.CUSTODY);
 },

 async limits(c,{userId,deps,send}){
  if(c.set===null)return void await send(render.limits(await deps.app.getLimits(userId)));
  await send('Limits set.\n\n'+render.limits(await deps.app.setLimits(userId,c.set)));
 },

 async revoke(_c,{userId,deps,send}){
  await deps.app.revokeLimits(userId);
  await send('Spending is revoked. Nothing can be spent until you set /limits again.');
 },

 async edge(c,{userId,deps,send}){
  if(c.text===null){
   const s=await deps.app.getStrategy(userId);
   return void await send(s
    ?('Your strategy, version '+s.version+':\n\n'+s.rawText)
    :'You have no strategy yet. Describe one with /edge <plain English>.');
  }
  const s=await deps.app.setStrategy(userId,c.text);
  await send('Strategy saved as version '+s.version+'.\n\n'+s.rawText);
 },

 async voice(c,{userId,deps,send}){
  const on=c.on??!await deps.voice.enabled(userId);
  await deps.voice.setEnabled(userId,on);
  await send(on
   ?'Voice notes on. I will speak confirmations as well as writing them.'
   :'Voice notes off.');
 },

 async trending(c,{deps,send}){
  await send(render.trending(await deps.app.trending(c.limit)));
 },

 async scan(c,{userId,deps,send}){
  await send(render.scan(await deps.app.scan(userId,c.limit)));
 },

 async why(c,{chatId,deps,send}){
  const row=await deps.app.explain(c.mint);
  const text=render.why(row,c.mint);
  const image=row?await deps.image(row.candidate.uri):null;
  if(!image)return void await send(text);
  // Telegram caps a caption at 1024 characters; the rest follows as text.
  await deps.out.photo(chatId,image,text.slice(0,1000));
  if(text.length>1000)await send(text.slice(1000));
 },

 async positions(c,{userId,deps,send}){
  await deps.app.reconcilePositions(userId);
  await send(render.positions(await deps.app.positions(userId,c.includeClosed)));
 },

 async sell(c,{userId,key,deps,send}){
  await send(report(await deps.app.sell(userId,c.positionId,key),'Sold'));
 },

 async buy(c,{userId,chatId,deps,send}){
  // The commit point is the keyboard, not this message.
  const id=randomBytes(6).toString('hex');
  await deps.pending.put(id,{userId,chatId,mint:c.mint,sol:c.sol});
  const keyboard:InlineKeyboard=
   [[{text:'Confirm buy',callback_data:CONFIRM+id},{text:'Cancel',callback_data:CANCEL+id}]];

  // Show what is being bought. A token we never measured says so instead
  // of borrowing the look of one we did.
  const row=await deps.app.explain(c.mint);
  const caption=render.confirm(c.mint,c.sol,row);
  const image=row?await deps.image(row.candidate.uri):null;
  if(image)await deps.out.photo(chatId,image,caption,keyboard);
  else await send(caption,keyboard);

  // Spoken afterwards, never instead. The written confirmation and its
  // keyboard are the commit point; audio is an extra.
  if(await deps.voice.enabled(userId)){
   const ogg=await deps.voice.say(spokenConfirm(c.sol,row,c.mint));
   if(ogg)await deps.out.voiceNote(chatId,ogg);
  }
 },
};

/** Dispatch. Commands with no handler are ones the router answers itself. */
export async function runCommand(command:Command,ctx:Ctx):Promise<void>{
 const handler=handlers[command.kind] as
  ((c:Command,ctx:Ctx)=>Promise<void>)|undefined;
 if(handler)await handler(command,ctx);
}

export {report};
