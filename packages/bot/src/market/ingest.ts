// What to do with one frame from the launch feed.
//
// Separated from the socket so it can be tested without a network. The
// socket, reconnection and process lifetime live in worker/feed.ts.
//
// Recording comes before measuring, always. A rate-limited RPC must not cost
// us the candidate: it stays in veyro_candidates unassessed, and a later pass
// can measure it.

import type {Candidate} from '../types';
import {parseFeedMessage} from './pumpportal';
import {parseTradeMessage,type Trade} from './trades';

export type IngestDeps={
 recordCandidate(candidate:Candidate):Promise<void>;
 assessAndRecord(candidate:Candidate,liquiditySol:number|null,bondingCurveKey:string|null):Promise<void>;
 onError(error:unknown):void;
 /** A trade on a token under observation. Synchronous and in-memory. */
 onTrade(trade:Trade):void;
};

/** The only two streams this bot reads. Trades are deliberately not one. */
export const SUBSCRIPTIONS=[
 {method:'subscribeNewToken'},
 {method:'subscribeMigration'},
] as const;

/** Sent per token once it is under observation, and withdrawn when it is not. */
export const watchTrades=(mint:string)=>({method:'subscribeTokenTrade',keys:[mint]});
export const unwatchTrades=(mint:string)=>({method:'unsubscribeTokenTrade',keys:[mint]});

export async function handleFeedMessage(frame:string,deps:IngestDeps):Promise<void>{
 let decoded:unknown;
 try{
  decoded=JSON.parse(frame);
 }catch{
  return; // Not JSON. The feed sends keepalives and notices too.
 }

 // Trades arrive on the same socket as launches and are far more frequent,
 // so they are checked first and never touch the database here.
 const trade=parseTradeMessage(decoded);
 if(trade){
  try{
   deps.onTrade(trade);
  }catch(e){
   deps.onError(e);
  }
  return;
 }

 const parsed=parseFeedMessage(decoded);
 if(parsed?.kind!=='candidate')return;

 try{
  await deps.recordCandidate(parsed.candidate);
 }catch(e){
  deps.onError(e);
  return;
 }

 try{
  await deps.assessAndRecord(parsed.candidate,parsed.liquiditySol,parsed.bondingCurveKey);
 }catch(e){
  // The candidate is already stored; it simply stays unassessed.
  deps.onError(e);
 }
}
