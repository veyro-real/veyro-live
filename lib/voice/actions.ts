// Spoken instructions waiting to be confirmed.
//
// One per user at a time, on purpose: saying it again should amend what you
// meant, not queue a second thing to happen. Kept in veyro_state rather than
// a new table, since it is short-lived UI state.

import {getState,saveState} from '../store';
import type {PendingAction,PendingActionStore} from '../telegram/ports';

const TTL_MS=10*60*1000;
const byId=(id:string)=>'tgaction:'+id;
const byUser=(userId:string)=>'tgaction:user:'+userId;

type Stored=PendingAction&{expiresAt:number};

export function actionStore(opts:{now?:()=>number;ttlMs?:number}={}):PendingActionStore{
 const now=opts.now??(()=>Date.now());
 const ttl=opts.ttlMs??TTL_MS;
 return {
  async put(id,value){
   await saveState(byId(id),{...value,expiresAt:now()+ttl} satisfies Stored);
   await saveState(byUser(value.userId),id);
  },
  async take(id){
   const record=await getState<Stored>(byId(id));
   if(!record)return null;
   await saveState(byId(id),null);
   await saveState(byUser(record.userId),null);
   if(record.expiresAt<=now())return null;
   const {expiresAt,...action}=record;
   return action;
  },
  async clear(userId){
   const id=await getState<string>(byUser(userId));
   if(id)await saveState(byId(id),null);
   await saveState(byUser(userId),null);
  },
 };
}
