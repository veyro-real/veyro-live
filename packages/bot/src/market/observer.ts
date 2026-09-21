// Holding a token under observation while its first trades arrive.
//
// The confirmation-snipe thesis needs a token watched for a window rather
// than judged at creation, so this keeps the trades for tokens currently in
// that window and hands them over when it closes.
//
// Everything is bounded. Launches arrive faster than any window closes, and
// a process that subscribes to every token's trade stream and keeps every
// trade will fall over. Both limits evict rather than grow, because losing
// an observation is recoverable and running out of memory mid-session is
// not.

import type {Candidate} from '../types';
import type {Trade} from './trades';

export type Watch={
 candidate:Candidate;
 windowStart:number;
 windowEnd:number;
 trades:Trade[];
 /** Curve state from the launch message, needed when the window closes. */
 liquiditySol:number|null;
 bondingCurveKey:string|null;
};

export type WatchDetails={liquiditySol?:number|null;bondingCurveKey?:string|null};

export type Observer={
 /** True when a new watch started, so the caller can subscribe. */
 open(candidate:Candidate,now:number,details?:WatchDetails):boolean;
 /** True when the trade belonged to a watched token. */
 record(trade:Trade):boolean;
 /** Watches whose window has elapsed. */
 due(now:number):Watch[];
 /** Hands over a watch and stops it. Null if it was not being watched. */
 close(mint:string):Watch|null;
 watching():string[];
};

export function createObserver(opts:{
 windowMs?:number;
 maxWatched?:number;
 maxTradesPerToken?:number;
}={}):Observer{
 const windowMs=opts.windowMs??60_000;
 const maxWatched=opts.maxWatched??200;
 const maxTrades=opts.maxTradesPerToken??500;
 // Insertion-ordered, so the first key is the oldest watch.
 const watches=new Map<string,Watch>();

 return {
  open(candidate,now,details){
   if(watches.has(candidate.mint))return false;
   if(watches.size>=maxWatched){
    const oldest=watches.keys().next().value;
    if(oldest!==undefined)watches.delete(oldest);
   }
   watches.set(candidate.mint,{
    candidate,windowStart:now,windowEnd:now+windowMs,trades:[],
    liquiditySol:details?.liquiditySol??null,
    bondingCurveKey:details?.bondingCurveKey??null,
   });
   return true;
  },

  record(trade){
   const watch=watches.get(trade.mint);
   if(!watch)return false;
   // Keep the earliest trades: the opening flow is the signal, and a token
   // spamming thousands must not evict other tokens' observations.
   if(watch.trades.length<maxTrades)watch.trades.push(trade);
   return true;
  },

  due(now){
   return [...watches.values()].filter(w=>now>w.windowEnd);
  },

  close(mint){
   const watch=watches.get(mint);
   if(!watch)return null;
   watches.delete(mint);
   return watch;
  },

  watching:()=>[...watches.keys()],
 };
}
