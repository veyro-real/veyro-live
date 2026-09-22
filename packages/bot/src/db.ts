// Typed access to the trading tables. Everything goes through service_role;
// there is no client-side Supabase in this app.

import {createClient,type SupabaseClient} from '@supabase/supabase-js';
import type {Candidate,Limits,Position,Strategy,User} from './types';

let client:SupabaseClient|undefined;
export function db(){
 if(!client){
  const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)throw Error('SUPABASE_NOT_CONFIGURED');
  client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 }
 return client;
}

function ok<T>(data:T,error:{message:string}|null,context:string):T{
 if(error)throw Error('DB_'+context+': '+error.message);
 return data;
}

// ---------------------------------------------------------------- users

export async function upsertUser(telegramChatId:string,username:string|null):Promise<User>{
 const existing=await findUserByChat(telegramChatId);
 if(existing){
  if(existing.telegramUsername===username)return existing;
  const {data,error}=await db().from('veyro_users').update({telegram_username:username})
   .eq('id',existing.id).select().single();
  return rowToUser(ok(data,error,'UPDATE_USER'));
 }
 const {data,error}=await db().from('veyro_users')
  .insert({telegram_chat_id:telegramChatId,telegram_username:username}).select().single();
 // A concurrent insert loses the unique race; read the winner instead of failing.
 if(error){const again=await findUserByChat(telegramChatId);if(again)return again;}
 return rowToUser(ok(data,error,'INSERT_USER'));
}

export async function findUserByChat(telegramChatId:string):Promise<User|null>{
 const {data,error}=await db().from('veyro_users').select()
  .eq('telegram_chat_id',telegramChatId).maybeSingle();
 const row=ok(data,error,'FIND_USER');
 return row?rowToUser(row):null;
}

export async function findUser(id:string):Promise<User|null>{
 const {data,error}=await db().from('veyro_users').select().eq('id',id).maybeSingle();
 const row=ok(data,error,'FIND_USER_BY_ID');
 return row?rowToUser(row):null;
}

export async function setUserWallet(id:string,pubkey:string):Promise<void>{
 const {error}=await db().from('veyro_users').update({wallet_pubkey:pubkey}).eq('id',id);
 ok(null,error,'SET_WALLET');
}

const rowToUser=(r:any):User=>({
 id:r.id,telegramChatId:r.telegram_chat_id,telegramUsername:r.telegram_username,
 walletPubkey:r.wallet_pubkey,
 // Defaults mirror the migration, so a row read before it ran is still sane.
 mode:r.mode==='live'?'live':'paper',
 paperLamports:String(r.paper_lamports??'5000000000'),
 createdAt:r.created_at,
});

export async function setMode(userId:string,mode:'paper'|'live'):Promise<User>{
 const {data,error}=await db().from('veyro_users')
  .update({mode}).eq('id',userId).select().single();
 return rowToUser(ok(data,error,'SET_MODE'));
}

export async function paperBalance(userId:string):Promise<bigint>{
 const {data,error}=await db().from('veyro_users')
  .select('paper_lamports').eq('id',userId).single();
 const row=ok(data,error,'PAPER_BALANCE');
 return BigInt(row?.paper_lamports??'0');
}

export async function setPaperBalance(userId:string,lamports:bigint):Promise<void>{
 const {error}=await db().from('veyro_users')
  .update({paper_lamports:lamports.toString()}).eq('id',userId);
 ok(null,error,'SET_PAPER_BALANCE');
}

// ---------------------------------------------------------------- limits

export async function writeLimits(l:Omit<Limits,'agentPubkey'>&{agentPubkey?:string|null}):Promise<Limits>{
 const {data,error}=await db().from('veyro_limits').upsert({
  user_id:l.userId,
  max_trade_lamports:l.maxTradeLamports.toString(),
  daily_cap_lamports:l.dailyCapLamports.toString(),
  expires_at:new Date(l.expiresAt*1000).toISOString(),
  active:l.active,
  policy_address:l.policyAddress,
  agent_pubkey:l.agentPubkey??null,
  updated_at:new Date().toISOString(),
 }).select().single();
 return rowToLimits(ok(data,error,'WRITE_LIMITS'));
}

export async function readLimits(userId:string):Promise<Limits|null>{
 const {data,error}=await db().from('veyro_limits').select().eq('user_id',userId).maybeSingle();
 const row=ok(data,error,'READ_LIMITS');
 return row?rowToLimits(row):null;
}

export async function deactivateLimits(userId:string):Promise<void>{
 const {error}=await db().from('veyro_limits')
  .update({active:false,updated_at:new Date().toISOString()}).eq('user_id',userId);
 ok(null,error,'REVOKE_LIMITS');
}

/** Lamports already reserved or settled today, for showing headroom. */
export async function spentToday(userId:string):Promise<bigint>{
 const day=new Date().toISOString().slice(0,10);
 const {data,error}=await db().from('veyro_spend_ledger').select('lamports')
  .eq('user_id',userId).eq('day',day).neq('state','RELEASED');
 return (ok(data,error,'SPENT_TODAY')||[]).reduce((sum:bigint,r:any)=>sum+BigInt(r.lamports),0n);
}

const rowToLimits=(r:any):Limits=>({
 userId:r.user_id,
 maxTradeLamports:BigInt(r.max_trade_lamports),
 dailyCapLamports:BigInt(r.daily_cap_lamports),
 expiresAt:Math.floor(new Date(r.expires_at).getTime()/1000),
 active:r.active,
 policyAddress:r.policy_address,
 agentPubkey:r.agent_pubkey,
});

// ---------------------------------------------------------------- spend

export type Claim={decision:'ALLOW';reservationId:string}|{decision:'DENY';reason:string};

/** The only authority on limits. Never reimplement these checks in TS. */
export async function claimSpend(userId:string,lamports:bigint):Promise<Claim>{
 const {data,error}=await db().rpc('veyro_claim_spend',{p_user:userId,p_lamports:lamports.toString()});
 return ok(data,error,'CLAIM_SPEND') as Claim;
}

export async function settleSpend(reservationId:string,state:'SETTLED'|'RELEASED',positionId:string|null){
 const {error}=await db().rpc('veyro_settle_spend',
  {p_claim:reservationId,p_state:state,p_position:positionId});
 ok(null,error,'SETTLE_SPEND');
}

// ---------------------------------------------------------------- positions

export async function openPosition(p:{
 userId:string;mint:string;symbol:string;entryLamports:bigint;strategyId:string|null;
 paper?:boolean;
}):Promise<Position>{
 const {data,error}=await db().from('veyro_positions').insert({
  user_id:p.userId,mint:p.mint,symbol:p.symbol,status:'OPENING',
  entry_lamports:p.entryLamports.toString(),strategy_id:p.strategyId,
  paper:p.paper===true,reason:p.paper===true?'PAPER_FILLING':'SUBMITTING',
 }).select().single();
 // One open position per mint is the schema's rule, not a fault. Reporting
 // it as a database failure tells the user to try again, which cannot work,
 // and hides the one thing they can act on: they already hold this.
 if(error?.code==='23505')throw Error('POSITION_ALREADY_OPEN');
 return rowToPosition(ok(data,error,'OPEN_POSITION'));
}

export async function updatePosition(id:string,patch:Partial<{
 status:Position['status'];entrySignature:string|null;tokensReceived:string|null;
 exitSignature:string|null;exitLamports:string|null;reason:string;closedAt:string|null;
}>):Promise<Position>{
 const row:Record<string,unknown>={};
 if(patch.status!==undefined)row.status=patch.status;
 if(patch.entrySignature!==undefined)row.entry_signature=patch.entrySignature;
 if(patch.tokensReceived!==undefined)row.tokens_received=patch.tokensReceived;
 if(patch.exitSignature!==undefined)row.exit_signature=patch.exitSignature;
 if(patch.exitLamports!==undefined)row.exit_lamports=patch.exitLamports;
 if(patch.reason!==undefined)row.reason=patch.reason;
 if(patch.closedAt!==undefined)row.closed_at=patch.closedAt;
 const {data,error}=await db().from('veyro_positions').update(row).eq('id',id).select().single();
 return rowToPosition(ok(data,error,'UPDATE_POSITION'));
}

export async function listPositions(userId:string,includeClosed:boolean):Promise<Position[]>{
 let q=db().from('veyro_positions').select().eq('user_id',userId)
  .order('opened_at',{ascending:false}).limit(50);
 if(!includeClosed)q=q.in('status',['OPENING','OPEN','CLOSING','UNKNOWN']);
 const {data,error}=await q;
 return (ok(data,error,'LIST_POSITIONS')||[]).map(rowToPosition);
}

export async function findPosition(id:string):Promise<Position|null>{
 const {data,error}=await db().from('veyro_positions').select().eq('id',id).maybeSingle();
 const row=ok(data,error,'FIND_POSITION');
 return row?rowToPosition(row):null;
}

const rowToPosition=(r:any):Position=>({
 id:r.id,userId:r.user_id,mint:r.mint,symbol:r.symbol,status:r.status,
 entrySignature:r.entry_signature,entryLamports:String(r.entry_lamports),
 tokensReceived:r.tokens_received===null?null:String(r.tokens_received),
 exitSignature:r.exit_signature,
 exitLamports:r.exit_lamports===null?null:String(r.exit_lamports),
 reason:r.reason,paper:r.paper===true,openedAt:r.opened_at,closedAt:r.closed_at,
});

// ---------------------------------------------------------------- candidates

export async function recordCandidate(c:Candidate):Promise<void>{
 const {error}=await db().from('veyro_candidates').upsert({
  mint:c.mint,symbol:c.symbol,name:c.name,launchpad:c.launchpad,creator:c.creator,
  first_seen:c.firstSeen,raw:c,
 },{onConflict:'mint',ignoreDuplicates:true});
 ok(null,error,'RECORD_CANDIDATE');
}

export async function recordAssessment(mint:string,assessment:unknown):Promise<void>{
 const {error}=await db().from('veyro_candidates')
  .update({assessment,assessed_at:new Date().toISOString()}).eq('mint',mint);
 ok(null,error,'RECORD_ASSESSMENT');
}

export async function unassessedCandidates(limit:number):Promise<Candidate[]>{
 const {data,error}=await db().from('veyro_candidates').select('raw')
  .is('assessment',null).order('first_seen',{ascending:true}).limit(limit);
 return (ok(data,error,'UNASSESSED')||[]).map((r:any)=>r.raw as Candidate);
}

export async function passedCandidates(limit:number):Promise<{candidate:Candidate;assessment:any}[]>{
 const {data,error}=await db().from('veyro_candidates').select('raw,assessment')
  .not('assessment','is',null).eq('assessment->>passed','true')
  .order('first_seen',{ascending:false}).limit(limit);
 return (ok(data,error,'PASSED')||[]).map((r:any)=>({candidate:r.raw,assessment:r.assessment}));
}

export async function findCandidate(mint:string):Promise<{candidate:Candidate;assessment:any}|null>{
 const {data,error}=await db().from('veyro_candidates').select('raw,assessment')
  .eq('mint',mint).maybeSingle();
 const row=ok(data,error,'FIND_CANDIDATE');
 return row?{candidate:row.raw,assessment:row.assessment}:null;
}

// ---------------------------------------------------------------- strategies

export async function writeStrategy(userId:string,rawText:string,compiled:unknown):Promise<Strategy>{
 await db().from('veyro_strategies').update({active:false}).eq('user_id',userId).eq('active',true);
 const {data:prev}=await db().from('veyro_strategies').select('version')
  .eq('user_id',userId).order('version',{ascending:false}).limit(1).maybeSingle();
 const version=((prev as any)?.version??0)+1;
 const {data,error}=await db().from('veyro_strategies')
  .insert({user_id:userId,version,raw_text:rawText,compiled,active:true}).select().single();
 return rowToStrategy(ok(data,error,'WRITE_STRATEGY'));
}

export async function readStrategy(userId:string):Promise<Strategy|null>{
 const {data,error}=await db().from('veyro_strategies').select()
  .eq('user_id',userId).eq('active',true).maybeSingle();
 const row=ok(data,error,'READ_STRATEGY');
 return row?rowToStrategy(row):null;
}

const rowToStrategy=(r:any):Strategy=>({
 id:r.id,userId:r.user_id,version:r.version,rawText:r.raw_text,
 compiled:r.compiled,active:r.active,createdAt:r.created_at,
});

// ---------------------------------------------------------------- telegram

/** True the first time an update_id is seen, false on redelivery. Telegram
 *  retries a webhook it thinks failed, and a redelivered /buy must not open a
 *  second position. */
export async function claimTelegramUpdate(updateId:number):Promise<boolean>{
 const {data,error}=await db().rpc('veyro_claim_telegram_update',{p_update_id:updateId});
 return ok(data,error,'CLAIM_TELEGRAM_UPDATE') as boolean;
}
