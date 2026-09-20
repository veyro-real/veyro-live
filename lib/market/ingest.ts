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

export type IngestDeps={
 recordCandidate(candidate:Candidate):Promise<void>;
 assessAndRecord(candidate:Candidate,liquiditySol:number|null,bondingCurveKey:string|null):Promise<void>;
 onError(error:unknown):void;
};

/** The only two streams this bot reads. Trades are deliberately not one. */
export const SUBSCRIPTIONS=[
 {method:'subscribeNewToken'},
 {method:'subscribeMigration'},
] as const;

export async function handleFeedMessage(frame:string,deps:IngestDeps):Promise<void>{
 let decoded:unknown;
 try{
  decoded=JSON.parse(frame);
 }catch{
  return; // Not JSON. The feed sends keepalives and notices too.
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
