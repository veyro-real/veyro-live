// Buying and selling with real funds.
//
// Three rules hold everywhere in this file.
//
// 1. Nothing spends without an ALLOW from veyro_claim_spend. The database is
//    the only authority on limits; this file never re-derives them.
// 2. A reservation is released only when we know no value moved. If a
//    transaction was sent and we cannot prove its outcome, the reservation
//    stays held and the position goes UNKNOWN for reconcile to settle. Losing
//    a little daily headroom is recoverable; double-spending it is not.
// 3. Denials are returned, not thrown. A user hitting their cap is a normal
//    outcome and the bot explains it.

import type {Position,SwapResult,TradeOutcome} from '../types';
import {
 claimSpend,findPosition,listPositions,openPosition,readLimits,readStrategy,
 settleSpend,updatePosition,
} from '../db';
import {claimRequest,finishRequest} from '../store';
import {ensureKeypair,spendableLamports} from '../wallet/custody';
import {SOL_MINT,buildSwap,confirm,quote,signSimulateSend,tokensReceived} from './jupiter';

const tradingEnabled=()=>process.env.VEYRO_TRADING_ENABLED==='true';

/**
 * A ceiling no /limits command can raise.
 *
 * veyro_claim_spend enforces the limits a user set for themselves, which
 * means a user can also raise them. This is the operator's bound on a
 * deployment and it lives outside Telegram: nothing sent to the bot can
 * widen it, so the worst case of a misheard amount, a bad rate or a wrong
 * limits command stays inside a number chosen here.
 *
 * Deliberately lamports rather than dollars: a price feed that fails must
 * never be able to fail this open.
 */
const DEFAULT_HARD_MAX_LAMPORTS=6_000_000n; // ~0.006 SOL

function hardMaxLamports():bigint{
 const raw=process.env.VEYRO_HARD_MAX_TRADE_LAMPORTS;
 if(!raw)return DEFAULT_HARD_MAX_LAMPORTS;
 try{
  const n=BigInt(raw);
  return n>0n?n:DEFAULT_HARD_MAX_LAMPORTS;
 }catch{
  return DEFAULT_HARD_MAX_LAMPORTS;
 }
}

const denied=(position:Position,reason:string):TradeOutcome=>
 ({position,result:{ok:false,reason,signature:null}});

/** A denial that never reached the position table. */
function phantom(userId:string,mint:string,symbol:string,lamports:bigint,reason:string):TradeOutcome{
 return {
  position:{
   id:'',userId,mint,symbol,status:'FAILED',entrySignature:null,
   entryLamports:lamports.toString(),tokensReceived:null,exitSignature:null,
   exitLamports:null,reason,paper:false,openedAt:new Date().toISOString(),closedAt:null,
  },
  result:{ok:false,reason,signature:null},
 };
}

export async function buy(
 userId:string,mint:string,lamports:bigint,symbol:string,key:string,
):Promise<TradeOutcome>{
 if(!tradingEnabled())return phantom(userId,mint,symbol,lamports,'TRADING_DISABLED');
 if(mint===SOL_MINT)return phantom(userId,mint,symbol,lamports,'CANNOT_BUY_SOL');
 // Before the request claim: an amount over the ceiling is refused outright
 // and never consumes an idempotency key it would only have to release.
 if(lamports>hardMaxLamports())return phantom(userId,mint,symbol,lamports,'ABOVE_HARD_CAP');

 // Redelivered Telegram update, or a retry. Never opens a second position.
 const claimed=await claimRequest(userId,'buy:'+key);
 if(claimed){
  if(claimed==='IN_PROGRESS')return phantom(userId,mint,symbol,lamports,'REQUEST_IN_FLIGHT');
  const prior=await findPosition(claimed);
  if(prior)return {position:prior,result:{ok:prior.status==='OPEN',signature:prior.entrySignature,outAmount:prior.tokensReceived??'0'} as SwapResult};
  return phantom(userId,mint,symbol,lamports,'REQUEST_ALREADY_HANDLED');
 }

 const kp=await ensureKeypair(userId);
 const spendable=await spendableLamports(kp.publicKey.toBase58());
 if(spendable<lamports){
  await finishRequest(userId,'buy:'+key,'');
  return phantom(userId,mint,symbol,lamports,'INSUFFICIENT_BALANCE');
 }

 const claim=await claimSpend(userId,lamports);
 if(claim.decision==='DENY'){
  await finishRequest(userId,'buy:'+key,'');
  return phantom(userId,mint,symbol,lamports,claim.reason);
 }

 const strategy=await readStrategy(userId);
 let position:Position;
 try{
  position=await openPosition({userId,mint,symbol,entryLamports:lamports,strategyId:strategy?.id??null});
 }catch(e){
  // Unique index rejected a second open position in the same mint.
  await settleSpend(claim.reservationId,'RELEASED',null);
  await finishRequest(userId,'buy:'+key,'');
  const reason=/veyro_positions_one_open_per_mint|POSITION_ALREADY_OPEN/.test(String(e))
   ?'POSITION_ALREADY_OPEN':'OPEN_POSITION_FAILED';
  return phantom(userId,mint,symbol,lamports,reason);
 }
 await finishRequest(userId,'buy:'+key,position.id);

 let signature:string|null=null;
 try{
  const q=await quote(SOL_MINT,mint,lamports);
  const tx=await buildSwap(q.raw,kp.publicKey.toBase58());
  // Past this line a transaction may exist on chain.
  signature=await signSimulateSend(tx,kp);
  position=await updatePosition(position.id,{entrySignature:signature,reason:'SUBMITTED'});

  const outcome=await confirm(signature);
  if(outcome==='FAILED'){
   // Confirmed failure means no value moved, so the headroom comes back.
   await settleSpend(claim.reservationId,'RELEASED',position.id);
   position=await updatePosition(position.id,{status:'FAILED',reason:'TRANSACTION_FAILED',closedAt:new Date().toISOString()});
   return {position,result:{ok:false,reason:'TRANSACTION_FAILED',signature}};
  }

  const received=await tokensReceived(signature,kp.publicKey.toBase58(),mint);
  await settleSpend(claim.reservationId,'SETTLED',position.id);
  position=await updatePosition(position.id,{status:'OPEN',tokensReceived:received,reason:'FILLED'});
  return {position,result:{ok:true,signature,outAmount:received??'0'}};
 }catch(e){
  const reason=(e as Error).message;
  if(signature){
   // Sent but unproven. Hold the reservation; reconcile decides.
   position=await updatePosition(position.id,{status:'UNKNOWN',reason});
   return {position,result:{ok:false,reason,signature}};
  }
  await settleSpend(claim.reservationId,'RELEASED',position.id);
  position=await updatePosition(position.id,{status:'FAILED',reason,closedAt:new Date().toISOString()});
  return denied(position,reason);
 }
}

export async function sell(userId:string,positionId:string,key:string):Promise<TradeOutcome>{
 const position=await findPosition(positionId);
 if(!position||position.userId!==userId)return phantom(userId,'','',0n,'POSITION_NOT_FOUND');
 if(!tradingEnabled())return denied(position,'TRADING_DISABLED');
 if(position.status!=='OPEN')return denied(position,'POSITION_NOT_OPEN');
 if(!position.tokensReceived||BigInt(position.tokensReceived)<=0n)return denied(position,'NOTHING_TO_SELL');

 const claimed=await claimRequest(userId,'sell:'+key);
 if(claimed){
  const prior=await findPosition(positionId);
  return {position:prior??position,result:{ok:false,reason:'REQUEST_ALREADY_HANDLED',signature:prior?.exitSignature??null}};
 }
 await finishRequest(userId,'sell:'+key,positionId);

 // Selling returns funds, so it needs no spend reservation.
 const kp=await ensureKeypair(userId);
 let current=await updatePosition(position.id,{status:'CLOSING',reason:'SUBMITTING'});
 let signature:string|null=null;
 try{
  const q=await quote(position.mint,SOL_MINT,BigInt(position.tokensReceived));
  const tx=await buildSwap(q.raw,kp.publicKey.toBase58());
  signature=await signSimulateSend(tx,kp);
  current=await updatePosition(current.id,{exitSignature:signature,reason:'SUBMITTED'});

  const outcome=await confirm(signature);
  if(outcome==='FAILED'){
   current=await updatePosition(current.id,{status:'OPEN',reason:'EXIT_FAILED'});
   return {position:current,result:{ok:false,reason:'EXIT_FAILED',signature}};
  }
  current=await updatePosition(current.id,{
   status:'CLOSED',exitLamports:q.outAmount,reason:'CLOSED',closedAt:new Date().toISOString(),
  });
  return {position:current,result:{ok:true,signature,outAmount:q.outAmount}};
 }catch(e){
  const reason=(e as Error).message;
  current=await updatePosition(current.id,{status:signature?'UNKNOWN':'OPEN',reason});
  return {position:current,result:{ok:false,reason,signature}};
 }
}

/**
 * Resolves positions whose transaction outcome was never proven, and releases
 * the reservations still held against them. Safe to call repeatedly.
 */
export async function reconcile(userId:string):Promise<Position[]>{
 const open=await listPositions(userId,false);
 const kp=await ensureKeypair(userId);
 for(const p of open){
  if(p.status!=='UNKNOWN'&&p.status!=='OPENING'&&p.status!=='CLOSING')continue;
  const signature=p.status==='CLOSING'?p.exitSignature:p.entrySignature;
  if(!signature){
   await updatePosition(p.id,{status:'FAILED',reason:'NEVER_SUBMITTED',closedAt:new Date().toISOString()});
   continue;
  }
  let outcome:'FINALIZED'|'FAILED';
  try{outcome=await confirm(signature,5_000);}catch{continue;} // still unresolved
  if(outcome==='FAILED'){
   await updatePosition(p.id,{
    status:p.exitSignature?'OPEN':'FAILED',
    reason:'TRANSACTION_FAILED',
    closedAt:p.exitSignature?null:new Date().toISOString(),
   });
   continue;
  }
  if(p.exitSignature){
   await updatePosition(p.id,{status:'CLOSED',reason:'CLOSED_ON_RECONCILE',closedAt:new Date().toISOString()});
  }else{
   const received=await tokensReceived(signature,kp.publicKey.toBase58(),p.mint);
   await updatePosition(p.id,{status:'OPEN',tokensReceived:received,reason:'FILLED_ON_RECONCILE'});
  }
 }
 return listPositions(userId,false);
}

export async function headroom(userId:string):Promise<{maxTrade:bigint;remainingToday:bigint}|null>{
 const limits=await readLimits(userId);
 if(!limits)return null;
 const {spentToday}=await import('../db');
 const used=await spentToday(userId);
 const remaining=limits.dailyCapLamports>used?limits.dailyCapLamports-used:0n;
 return {maxTrade:limits.maxTradeLamports,remainingToday:remaining};
}
