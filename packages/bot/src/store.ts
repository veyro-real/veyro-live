import {randomUUID} from 'node:crypto';
import {createClient,type SupabaseClient} from '@supabase/supabase-js';

type MemoryAttempt={session:string;payload:Attempt;order:number};
const memoryState=new Map<string,unknown>();
const memoryAttempts=new Map<string,MemoryAttempt>();
let memoryOrder=0,cloud:SupabaseClient|undefined;

const memoryEnabled=()=>process.env.VEYRO_STORE==='memory';
function supabase(){
 if(!cloud){
  const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)throw Error('SUPABASE_NOT_CONFIGURED');
  cloud=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 }
 return cloud;
}
// Carries the reason. A bare 'SUPABASE_STORE_ERROR' told us a write failed
// and nothing about why, which hid a not-null violation behind a generic
// string. `message` is the diagnostic line; `details` can echo row contents,
// so it is deliberately not included.
function checked<T>(data:T,error:{message:string}|null,context:string):T{
 if(error)throw Error('SUPABASE_STORE_ERROR['+context+']: '+error.message);
 return data;
}

export type Attempt={id:string;at:string;kind:string;request:unknown;agent:string|null;policy:unknown;decision:'ALLOW'|'DENY'|null;reason:string;status:string;candidateSignature?:string;executedSignature?:string;wire?:string;lastValidBlockHeight?:number;[key:string]:unknown};

export async function getState<T>(id:string):Promise<T|null>{
 if(memoryEnabled())return memoryState.has(id)?memoryState.get(id) as T:null;
 const {data,error}=await supabase().from('veyro_state').select('value').eq('id',id).maybeSingle();
 return (checked(data,error,'getState')?.value as T|undefined)??null;
}
export async function saveState(id:string,value:unknown){
 // veyro_state.value is `jsonb not null`. The memory store enforces it too,
 // so a null write fails in tests rather than only against Postgres.
 if(value===null||value===undefined)throw Error('STATE_VALUE_REQUIRED: use clearState to remove '+id);
 if(memoryEnabled()){memoryState.set(id,value);return;}
 const {error}=await supabase().from('veyro_state').upsert({id,value,updated_at:new Date().toISOString()});
 checked(null,error,'saveState');
}
export async function beginAttempt(session:string,kind:string,request:unknown){
 const attempt:Attempt={id:randomUUID(),at:new Date().toISOString(),kind,request,agent:null,policy:null,decision:null,reason:'RECEIVED',status:'RECEIVED'};
 await recordAttempt(session,attempt);
 return attempt;
}
export async function recordAttempt(session:string,attempt:Attempt){
 if(memoryEnabled()){
  const previous=memoryAttempts.get(attempt.id);
  memoryAttempts.set(attempt.id,{session,payload:structuredClone(attempt),order:previous?.order??memoryOrder++});
  return;
 }
 const {error}=await supabase().rpc('veyro_record_attempt',{p_id:attempt.id,p_session:session,p_payload:attempt});
 checked(null,error,'recordAttempt');
}
export async function attempts(session:string,privateFields=false):Promise<Attempt[]>{
 let values:Attempt[];
 if(memoryEnabled()){
  values=[...memoryAttempts.values()].filter(value=>value.session===session).sort((a,b)=>b.order-a.order).slice(0,100).map(value=>structuredClone(value.payload));
 }else{
  const {data,error}=await supabase().from('veyro_attempts').select('payload').eq('session',session).order('created_at',{ascending:false}).limit(100);
  values=(checked(data,error,'attempts')||[]).map(row=>row.payload as Attempt);
 }
 return values.map(value=>{const attempt={...value};if(!privateFields){delete attempt.wire;delete attempt.pendingRuntime;}return attempt;});
}
/** Removes a state row. Clearing is a delete, not a write of null. */
export async function clearState(id:string){
 if(memoryEnabled()){memoryState.delete(id);return;}
 const {error}=await supabase().from('veyro_state').delete().eq('id',id);
 checked(null,error,'clearState');
}

export async function claimRequest(session:string,key:string):Promise<string|null>{
 const id='request:'+session+':'+key;
 if(memoryEnabled()){
  const existing=memoryState.get(id) as string|undefined;
  if(existing)return existing;
  memoryState.set(id,'IN_PROGRESS');
  return null;
 }
 const {data,error}=await supabase().rpc('veyro_claim_request',{p_id:id});
 return checked(data,error,'claimRequest') as string|null;
}
export async function finishRequest(session:string,key:string,attempt:string){await saveState('request:'+session+':'+key,attempt);}
export async function getSecret(id:string):Promise<unknown|null>{
 if(memoryEnabled())return memoryState.get('secret:'+id)??null;
 const {data,error}=await supabase().from('veyro_secrets').select('encrypted_value').eq('id',id).maybeSingle();
 return (checked(data,error,'getSecret')?.encrypted_value as unknown|undefined)??null;
}
export async function saveSecret(id:string,encryptedValue:unknown){
 if(memoryEnabled()){memoryState.set('secret:'+id,encryptedValue);return;}
 const {error}=await supabase().from('veyro_secrets').upsert({id,encrypted_value:encryptedValue,updated_at:new Date().toISOString()});
 checked(null,error,'saveSecret');
}
