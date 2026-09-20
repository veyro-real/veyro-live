// Buys the user has been shown but has not yet confirmed.
//
// take() has to be atomic. Two taps on the same keyboard arrive as two
// different update_ids, so the webhook's update dedupe does not cover them;
// what stops the second tap is that only one caller can claim the record.
// claimRequest() is that claim, and it is a single INSERT ... ON CONFLICT in
// Postgres, so the loser sees the winner's mark rather than a stale read.

import {claimRequest,getState,saveState} from '../store';
import type {PendingBuy,PendingStore} from './ports';

/** Long enough to read the confirmation, short enough that a stale tap dies. */
const TTL_MS=10*60*1000;

type Record=PendingBuy&{expiresAt:number};

export function pendingStore(opts:{now?:()=>number;ttlMs?:number}={}):PendingStore{
 const now=opts.now??(()=>Date.now());
 const ttl=opts.ttlMs??TTL_MS;
 const key=(id:string)=>'tgbuy:'+id;

 return {
  async put(id,value){
   await saveState(key(id),{...value,expiresAt:now()+ttl} satisfies Record);
  },
  async take(id){
   const record=await getState<Record>(key(id));
   if(!record)return null;
   if(record.expiresAt<=now())return null;
   // Whoever claims first owns the buy; everyone else gets null.
   if(await claimRequest('telegram','confirm:'+id)!==null)return null;
   const {expiresAt,...buy}=record;
   return buy;
  },
 };
}
