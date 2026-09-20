// Closing an observation window: measure, judge, store.
//
// Lifted out of the worker so the most consequential loop in the pipeline
// can be tested. It decides what gets measured, what gets dropped and what
// is written to the database, and while it lived tangled up with a
// websocket none of that had a single test over it.
//
// Nothing here throws. A settle that fails must still close the stream and
// report, because a leaked subscription costs the process and a thrown
// error costs the socket loop.

import type {Assessment} from '../types';
import {assess} from './filter';
import {buildFeatures,type MintFacts} from './features';
import {flowFeatures} from './flow';
import type {Observer,Watch} from './observer';

export type SettleDeps={
 readFacts(mint:string,bondingCurveKey:string|null):Promise<MintFacts>;
 record(mint:string,payload:unknown):Promise<void>;
 /** Stop the per-token trade stream. Called on every path, including failure. */
 unwatch(mint:string):void;
 onError(mint:string,error:unknown):void;
};

/** The assessment, or null when it could not be completed. */
export async function settleWatch(watch:Watch,deps:SettleDeps):Promise<Assessment|null>{
 const mint=watch.candidate.mint;
 deps.unwatch(mint);
 try{
  const flow=flowFeatures(watch.trades,{
   windowStart:watch.windowStart,
   windowEnd:watch.windowEnd,
   creator:watch.candidate.creator,
  });

  const facts=await deps.readFacts(mint,watch.bondingCurveKey);
  // The last trade carries the freshest curve depth; the launch value is
  // only a fallback for a window that saw nothing.
  const liquidity=watch.trades.at(-1)?.curveSol??watch.liquiditySol;
  const features=buildFeatures(watch.candidate,liquidity,facts,{
   buys:flow.buys,sells:flow.sells,uniqueBuyers:flow.uniqueBuyers,
  });
  const assessment=assess(watch.candidate,features);

  // Flow rides alongside rather than inside: Features has no fields for
  // most of it, and it is research data the filter does not read yet.
  await deps.record(mint,{...assessment,features,flow});
  return assessment;
 }catch(e){
  deps.onError(mint,e);
  return null;
 }
}

export type Drainer={
 /** Settles every window that has closed. Returns how many were settled. */
 run(now:number):Promise<number>;
};

export function createDrainer(
 observer:Observer,
 deps:SettleDeps,
 opts:{gapMs?:number}={},
):Drainer{
 const gapMs=opts.gapMs??400;
 let running=false;

 return {
  async run(now){
   // One at a time. Overlapping drains would multiply the RPC load at
   // exactly the moment a backlog means it is already struggling.
   if(running)return 0;
   running=true;
   let settled=0;
   try{
    for(const watch of observer.due(now)){
     // Claim it before the await, so a concurrent caller cannot take it.
     if(!observer.close(watch.candidate.mint))continue;
     await settleWatch(watch,deps);
     settled++;
     if(gapMs>0)await new Promise(r=>setTimeout(r,gapMs));
    }
   }finally{
    running=false;
   }
   return settled;
  },
 };
}
