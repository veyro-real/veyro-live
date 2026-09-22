// Paper trading.
//
// Simulated money, real prices. A paper fill is priced from the same Jupiter
// quote a live trade would use, so what a user learns here transfers: the
// slippage they see is the slippage that was quoted.
//
// Two rules make a paper row impossible to mistake for a real one. It never
// carries a signature, because a signature means a transaction existed. And
// it never touches the custodial wallet, the spend ledger, or the chain —
// there is no code path from here to a keypair.

import {SOL_MINT} from './jupiter';
import type {Position, TradeOutcome} from '../types';

/** Simulated opening balance: enough to make several mistakes with, small
 *  enough that nobody mistakes it for real money. */
export const PAPER_START_LAMPORTS=5_000_000_000n;

/** Everything paper trading touches, injected so it can be tested without a
 *  database or a network. */
export type PaperDeps={
 quote(inputMint:string,outputMint:string,amount:bigint):Promise<{outAmount:string}>;
 paperBalance(userId:string):Promise<bigint>;
 setPaperBalance(userId:string,lamports:bigint):Promise<void>;
 open(p:{userId:string;mint:string;symbol:string;entryLamports:bigint}):Promise<Position>;
 update(id:string,patch:Partial<Position>):Promise<Position>;
 find(id:string):Promise<Position|null>;
};

/** A refusal that never happened, shaped like an outcome so callers render it
 *  the same way as a real one. */
const refused=(userId:string,mint:string,symbol:string,lamports:bigint,reason:string):TradeOutcome=>({
 position:{
  id:'',userId,mint,symbol,status:'FAILED',entrySignature:null,
  entryLamports:lamports.toString(),tokensReceived:null,exitSignature:null,
  exitLamports:null,reason,paper:true,openedAt:new Date().toISOString(),closedAt:null,
 } as Position,
 result:{ok:false,reason,signature:null},
});

export async function paperBuy(
 userId:string,mint:string,lamports:bigint,symbol:string,deps:PaperDeps,
):Promise<TradeOutcome>{
 if(lamports<=0n)return refused(userId,mint,symbol,lamports,'PAPER_INVALID_AMOUNT');

 const balance=await deps.paperBalance(userId);
 if(balance<lamports)return refused(userId,mint,symbol,lamports,'PAPER_INSUFFICIENT_BALANCE');

 // Quote before debiting: a failed quote must leave the balance alone.
 let outAmount:string;
 try{
  outAmount=(await deps.quote(SOL_MINT,mint,lamports)).outAmount;
 }catch(e){
  return refused(userId,mint,symbol,lamports,'PAPER_QUOTE_FAILED: '+(e as Error).message);
 }

 // One open position per mint, same as the live path. Already holding this
 // is a normal answer, not a fault, so it is refused rather than thrown: a
 // throw reaches the router as "something went wrong on our side", which
 // tells the user to retry something that cannot succeed.
 let position;
 try{
  position=await deps.open({userId,mint,symbol,entryLamports:lamports});
 }catch(e){
  const already=/veyro_positions_one_open_per_mint|POSITION_ALREADY_OPEN/.test(String(e));
  return refused(userId,mint,symbol,lamports,
   already?'POSITION_ALREADY_OPEN':'PAPER_OPEN_FAILED');
 }
 await deps.setPaperBalance(userId,balance-lamports);
 const filled=await deps.update(position.id,{
  status:'OPEN',tokensReceived:outAmount,reason:'PAPER_FILL',
 });
 return {position:filled,result:{ok:true,signature:null,paper:true,outAmount}};
}

export async function paperSell(
 userId:string,positionId:string,deps:PaperDeps,
):Promise<TradeOutcome>{
 const position=await deps.find(positionId);
 if(!position)return refused(userId,'','',0n,'PAPER_POSITION_NOT_FOUND');
 if(position.status!=='OPEN'){
  return refused(userId,position.mint,position.symbol,0n,'PAPER_POSITION_NOT_OPEN');
 }
 const tokens=BigInt(position.tokensReceived??'0');
 if(tokens<=0n){
  return refused(userId,position.mint,position.symbol,0n,'PAPER_NOTHING_TO_SELL');
 }

 let proceeds:string;
 try{
  proceeds=(await deps.quote(position.mint,SOL_MINT,tokens)).outAmount;
 }catch(e){
  return refused(userId,position.mint,position.symbol,0n,
   'PAPER_QUOTE_FAILED: '+(e as Error).message);
 }

 const balance=await deps.paperBalance(userId);
 await deps.setPaperBalance(userId,balance+BigInt(proceeds));
 const closed=await deps.update(position.id,{
  status:'CLOSED',exitLamports:proceeds,reason:'PAPER_EXIT',
  closedAt:new Date().toISOString(),
 });
 return {position:closed,result:{ok:true,signature:null,paper:true,outAmount:proceeds}};
}

/** Realised or unrealised, in lamports. Negative is a loss. */
export const paperPnl=(position:Position):bigint|null=>
 position.exitLamports===null
  ?null
  :BigInt(position.exitLamports)-BigInt(position.entryLamports);
