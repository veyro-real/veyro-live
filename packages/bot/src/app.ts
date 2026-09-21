// The only surface the Telegram layer calls. Channel adapters (Telegram,
// MCP, web) translate to and from these; none of them reach into lib/trade,
// lib/wallet or lib/market directly.
//
// Signatures are frozen: change one and tell the channel owner first.
// The bodies are thin on purpose. Limits live in veyro_claim_spend, custody
// lives in lib/wallet, the money path lives in lib/trade/execute. Nothing
// here re-decides any of that.

import type {
 Assessment, Candidate, Limits, Position, Strategy, StrategyMatch, TradeOutcome, User,
} from './types';
import {
 findCandidate, listPositions, passedCandidates, readLimits, readStrategy,
 deactivateLimits, upsertUser, writeLimits, writeStrategy,
} from './db';
import {balanceLamports, ensureKeypair, solToLamports} from './wallet/custody';
import {buy as tradeBuy, reconcile, sell as tradeSell} from './trade/execute';
import {dexscreener} from './market/dexscreener';
import {compileStrategy} from './strategy/compile';
import {matchStrategy} from './strategy/match';

export type {TradeOutcome};

export type ScanRow={
 candidate:Candidate;
 assessment:Assessment;
 match:StrategyMatch|null;
};

/**
 * A token that is loud right now. Distinct from ScanRow on purpose: these
 * are not launches and our rejection filter does not apply to them, so
 * presenting them in the same shape would imply an assessment we never made.
 */
export type TrendingRow={
 mint:string;
 symbol:string;
 name:string;
 description:string;
 /** Paid placement amount. Budget, not organic interest. */
 boost:number|null;
 liquiditySol:number|null;
 marketCapUsd:number|null;
 buys5m:number|null;
 sells5m:number|null;
 ageSeconds:number;
 uri:string|null;
};

/** Idempotency key. The Telegram layer passes the update_id so a redelivered
 *  webhook can never open a second position. */
export type RequestKey=string;

// ---------------------------------------------------------------- identity

export async function ensureUser(telegramChatId:string,username:string|null):Promise<User>{
 return upsertUser(telegramChatId,username);
}

/** Creates the custodied wallet on first call. Returns the deposit address. */
export async function ensureWallet(userId:string):Promise<{pubkey:string;lamports:string}>{
 const kp=await ensureKeypair(userId);
 const pubkey=kp.publicKey.toBase58();
 // A balance read must never stop a user seeing where to deposit.
 let lamports='0';
 try{
  lamports=(await balanceLamports(pubkey)).toString();
 }catch{}
 return {pubkey,lamports};
}

export async function linkX(userId:string,accessToken:string,refreshToken:string,handle:string):Promise<void>{
 // Nothing stores an X identity yet: veyro_users has no columns for one and
 // there is no OAuth route. Failing loudly beats pretending it linked.
 throw Error('X_LINKING_NOT_AVAILABLE');
}

// ---------------------------------------------------------------- limits

export async function setLimits(
 userId:string,
 input:{maxTradeSol:number;dailyCapSol:number;hours:number},
):Promise<Limits>{
 return writeLimits({
  userId,
  maxTradeLamports:solToLamports(input.maxTradeSol),
  dailyCapLamports:solToLamports(input.dailyCapSol),
  expiresAt:Math.floor(Date.now()/1000)+Math.round(input.hours*3600),
  active:true,
  // Set once the mainnet policy account exists. Enforcement is unchanged.
  policyAddress:null,
 });
}

export async function getLimits(userId:string):Promise<Limits|null>{
 return readLimits(userId);
}

export async function revokeLimits(userId:string):Promise<void>{
 return deactivateLimits(userId);
}

// ---------------------------------------------------------------- strategy

/** Compiles plain English into a CompiledStrategy and stores it as a new
 *  version. The previous version is deactivated, never deleted. */
export async function setStrategy(userId:string,rawText:string):Promise<Strategy>{
 return writeStrategy(userId,rawText,compileStrategy(rawText));
}

export async function getStrategy(userId:string):Promise<Strategy|null>{
 return readStrategy(userId);
}

// ---------------------------------------------------------------- market

/** Recent candidates that passed the rejection filter, newest first, with the
 *  user's strategy applied when they have one. */
export async function scan(userId:string,limit:number):Promise<ScanRow[]>{
 const [rows,strategy]=await Promise.all([passedCandidates(limit),readStrategy(userId)]);
 return rows.map(({candidate,assessment})=>({
  candidate,
  assessment:assessment as Assessment,
  match:strategy?matchStrategy(strategy,candidate,assessment as Assessment):null,
 }));
}

/**
 * What is loud on DexScreener. Free and keyless, but a boost is a paid
 * placement: it measures who spent money on visibility, not who earned
 * attention, and the copy has to say so.
 */
export async function trending(limit:number):Promise<TrendingRow[]>{
 const ds=dexscreener();
 const boosts=(await ds.trending()).slice(0,limit);
 const rows=await Promise.all(boosts.map(async b=>{
  const pair=await ds.pair(b.mint);
  if(!pair)return null;
  return {
   mint:b.mint,
   symbol:pair.candidate.symbol,
   name:pair.candidate.name,
   description:b.description,
   boost:b.boost,
   liquiditySol:pair.liquiditySol,
   marketCapUsd:pair.marketCapUsd,
   buys5m:pair.buys5m,
   sells5m:pair.sells5m,
   ageSeconds:pair.ageSeconds,
   uri:pair.candidate.uri,
  } satisfies TrendingRow;
 }));
 return rows.filter((r):r is TrendingRow=>r!==null);
}

/** Why a specific mint scored what it scored. Safe to call for any mint. */
export async function explain(mint:string):Promise<ScanRow|null>{
 const row=await findCandidate(mint);
 // Known but not yet assessed is still "no measurement to explain".
 if(!row||!row.assessment)return null;
 return {candidate:row.candidate,assessment:row.assessment as Assessment,match:null};
}

// ---------------------------------------------------------------- trading

/** Claims spend against veyro_claim_spend, then swaps SOL for the mint via
 *  Jupiter. Denials come back as result.ok === false with a named reason;
 *  they are not thrown. */
export async function buy(
 userId:string,
 mint:string,
 sol:number,
 key:RequestKey,
):Promise<TradeOutcome>{
 const known=await findCandidate(mint);
 const symbol=known?.candidate.symbol??mint.slice(0,4);
 return tradeBuy(userId,mint,solToLamports(sol),symbol,key);
}

export async function sell(userId:string,positionId:string,key:RequestKey):Promise<TradeOutcome>{
 return tradeSell(userId,positionId,key);
}

export async function positions(userId:string,includeClosed:boolean):Promise<Position[]>{
 return listPositions(userId,includeClosed);
}

/** Reconciles OPENING/CLOSING positions against chain state. Safe to call on
 *  every /positions and from the worker. */
export async function reconcilePositions(userId:string):Promise<Position[]>{
 return reconcile(userId);
}
