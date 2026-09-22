// The only surface the Telegram layer calls. Channel adapters (Telegram,
// MCP, web) translate to and from these; none of them reach into lib/trade,
// lib/wallet or lib/market directly.
//
// Signatures are frozen: change one and tell the channel owner first.
// The bodies are thin on purpose. Limits live in veyro_claim_spend, custody
// lives in lib/wallet, the money path lives in lib/trade/execute. Nothing
// here re-decides any of that.

import {PublicKey} from '@solana/web3.js';
import type {
 Assessment, Candidate, Limits, Position, Strategy, StrategyMatch, TradeOutcome, User,
} from './types';
import {
 findCandidate, findPosition, findUser, listPositions, openPosition,
 paperBalance, passedCandidates, readLimits, readStrategy, setMode,
 setPaperBalance, deactivateLimits, updatePosition, upsertUser, writeLimits,
 writeStrategy,
} from './db';
import {balanceLamports, ensureKeypair, mainnet, solToLamports} from './wallet/custody';
import {buy as tradeBuy, reconcile, sell as tradeSell} from './trade/execute';
import {paperBuy, paperSell} from './trade/paper';
import {SOL_MINT,quote,routeLabels} from './trade/jupiter';
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
export async function ensureWallet(userId:string):Promise<{pubkey:string;lamports:string|null}>{
 const kp=await ensureKeypair(userId);
 const pubkey=kp.publicKey.toBase58();
 // A balance read must never stop a user seeing where to deposit, so a
 // failure here is not fatal. It is reported as null rather than '0': a user
 // who has just deposited would read a zero as their funds being gone.
 try{
  return {pubkey,lamports:(await balanceLamports(pubkey)).toString()};
 }catch{
  return {pubkey,lamports:null};
 }
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

/**
 * What a buy would actually do, priced now.
 *
 * The confirmation is the moment a user decides, so it should name the token
 * rather than only its mint, and say which venue the liquidity comes from.
 * Everything here is best-effort: a preview that fails must not stop the
 * trade being offered, so each part degrades to null on its own.
 */
export type BuyPreview={
 symbol:string|null;
 name:string|null;
 /** The token's own decimals. Without them an amount is not a quantity. */
 decimals:number|null;
 /** Null when no route could be priced just now. */
 quote:{
  outAmount:string;
  minOutAmount:string;
  priceImpactPct:number;
  slippageBps:number;
  route:string[];
 }|null;
};

export async function previewBuy(mint:string,sol:number):Promise<BuyPreview> {
 const [named,priced,decimals]=await Promise.all([
  (async()=>{
   const known=await findCandidate(mint);
   if(known)return {symbol:known.candidate.symbol,name:known.candidate.name};
   // Not a launch we saw. DexScreener knows anything with a live pair.
   const pair=await dexscreener().pair(mint).catch(()=>null);
   return pair?{symbol:pair.candidate.symbol,name:pair.candidate.name}:null;
  })().catch(()=>null),
  (async()=>{
   const q=await quote(SOL_MINT,mint,solToLamports(sol));
   return {
    outAmount:q.outAmount,
    minOutAmount:q.minOutAmount,
    priceImpactPct:q.priceImpactPct,
    slippageBps:q.slippageBps,
    route:routeLabels(q.routePlan),
   };
  })().catch(()=>null),
  (async()=>{
   const supply=await mainnet().getTokenSupply(new PublicKey(mint));
   return supply.value.decimals;
  })().catch(()=>null),
 ]);
 return {
  symbol:named?.symbol??null,name:named?.name??null,
  decimals:decimals??null,quote:priced,
 };
}

// ---------------------------------------------------------------- trading

/** Claims spend against veyro_claim_spend, then swaps SOL for the mint via
 *  Jupiter. Denials come back as result.ok === false with a named reason;
 *  they are not thrown. */
/** Wiring for simulated trades. Deliberately assembled here rather than
 *  imported inside paper.ts, so there is no path from the paper module to a
 *  keypair or the spend ledger. */
const paperDeps=()=>({
 quote,
 paperBalance,
 setPaperBalance,
 open:(p:{userId:string;mint:string;symbol:string;entryLamports:bigint})=>
  openPosition({...p,strategyId:null,paper:true}),
 update:updatePosition,
 find:findPosition,
});

export async function buy(
 userId:string,
 mint:string,
 sol:number,
 key:RequestKey,
):Promise<TradeOutcome>{
 const known=await findCandidate(mint);
 const symbol=known?.candidate.symbol??mint.slice(0,4);
 const lamports=solToLamports(sol);
 const user=await findUser(userId);
 if(user?.mode!=='live')return paperBuy(userId,mint,lamports,symbol,paperDeps());
 return tradeBuy(userId,mint,lamports,symbol,key);
}

export async function sell(userId:string,positionId:string,key:RequestKey):Promise<TradeOutcome>{
 const position=await findPosition(positionId);
 if(position?.paper)return paperSell(userId,positionId,paperDeps());
 return tradeSell(userId,positionId,key);
}

/** Switches between simulated and live trading. Open positions are untouched:
 *  a paper position stays paper and a live one stays live. */
export async function setTradingMode(userId:string,mode:'paper'|'live'){
 return setMode(userId,mode);
}

export async function tradingMode(userId:string):Promise<{mode:'paper'|'live';paperLamports:string}>{
 const user=await findUser(userId);
 return {mode:user?.mode??'paper',paperLamports:user?.paperLamports??'0'};
}

export async function positions(userId:string,includeClosed:boolean):Promise<Position[]>{
 return listPositions(userId,includeClosed);
}

/** Reconciles OPENING/CLOSING positions against chain state. Safe to call on
 *  every /positions and from the worker. */
export async function reconcilePositions(userId:string):Promise<Position[]>{
 return reconcile(userId);
}
