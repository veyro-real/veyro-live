// Measuring a candidate.
//
// Only what was actually read is reported. Everything else stays null, and
// the filter treats a null safety property as a rejection, so a rate-limited
// RPC makes the bot more cautious rather than less.
//
// Concentration is measured against the float, not the supply. Before a
// pump.fun token graduates, its unsold supply sits in the bonding curve, so
// counting that as a holder makes every fresh launch look 100% concentrated
// and rejects exactly the tokens this bot exists to look at. The curve's
// token account is derived locally and removed from both sides of the ratio.

import {PublicKey} from '@solana/web3.js';
import {mainnet} from '../wallet/custody';
import type {Candidate,Features} from '../types';

export type MintInfo={
 mintAuthority:string|null;
 freezeAuthority:string|null;
 supply:string;
 decimals:number;
};

export type TokenAccount={
 address:string;
 amount:string;
 /** The wallet or program account that owns this token account. */
 owner:string|null;
};

/** The chain reads this module needs, so it can be tested without an RPC. */
export type ChainReader={
 mintInfo(mint:string):Promise<MintInfo|null>;
 /** The largest token accounts for a mint, biggest first. */
 largestAccounts(mint:string):Promise<TokenAccount[]>;
};

export type MintFacts={
 mintAuthorityRevoked:boolean|null;
 freezeAuthorityRevoked:boolean|null;
 /** Percent of the float held by the ten largest real holders. */
 top10Pct:number|null;
 /** How many non-protocol accounts actually hold any of it. */
 floatHolders:number|null;
};

const UNKNOWN:MintFacts={mintAuthorityRevoked:null,freezeAuthorityRevoked:null,top10Pct:null,floatHolders:null};

export async function readMintFacts(
 mint:string,
 reader:ChainReader,
 bondingCurveKey?:string|null,
):Promise<MintFacts>{
 let info:MintInfo|null;
 try{
  info=await reader.mintInfo(mint);
 }catch{
  return UNKNOWN; // Rate limited or unreachable. Unknown, not safe.
 }
 if(!info)return UNKNOWN;

 return {
  // Solana reports a revoked authority as absent.
  mintAuthorityRevoked:info.mintAuthority===null,
  freezeAuthorityRevoked:info.freezeAuthority===null,
  ...await distribution(mint,reader,info.supply,bondingCurveKey),
 };
}

async function distribution(
 mint:string,
 reader:ChainReader,
 rawSupply:string,
 bondingCurveKey?:string|null,
):Promise<{top10Pct:number|null;floatHolders:number|null}>{
 try{
  let supply=BigInt(rawSupply);
  if(supply<=0n)return {top10Pct:null,floatHolders:null};

  let accounts=await reader.largestAccounts(mint);

  if(bondingCurveKey){
   // Match on who owns the account, not on a derived address. pump.fun
   // tokens are Token-2022, so a classic-SPL associated-token derivation
   // produces an address that appears nowhere in the holders and silently
   // excludes nothing -- which made every launch look 100% concentrated.
   const isCurve=(a:TokenAccount)=>a.owner===bondingCurveKey;
   const held=accounts.filter(isCurve).reduce((sum,a)=>sum+BigInt(a.amount),0n);
   accounts=accounts.filter(a=>!isCurve(a));
   supply-=held;
   // Everything still in the curve means there is no float to judge yet.
   if(supply<=0n)return {top10Pct:null,floatHolders:0};
  }

  // An account with a zero balance is not a holder.
  const holders=accounts.filter(a=>BigInt(a.amount)>0n);
  const top=holders.slice(0,10).reduce((sum,a)=>sum+BigInt(a.amount),0n);
  // Basis points first, so integer maths does the rounding.
  return {top10Pct:Number((top*10000n)/supply)/100,floatHolders:holders.length};
 }catch{
  return {top10Pct:null,floatHolders:null};
 }
}

/** The live reader. Read-only; never used for signing. */
export function rpcReader():ChainReader{
 return {
  async mintInfo(mint){
   const res=await mainnet().getParsedAccountInfo(new PublicKey(mint));
   const parsed=(res.value?.data as any)?.parsed?.info;
   if(!parsed)return null;
   return {
    mintAuthority:parsed.mintAuthority??null,
    freezeAuthority:parsed.freezeAuthority??null,
    supply:String(parsed.supply??'0'),
    decimals:Number(parsed.decimals??0),
   };
  },
  async largestAccounts(mint){
   const res=await mainnet().getTokenLargestAccounts(new PublicKey(mint));
   const addresses=res.value.map(v=>v.address);
   if(addresses.length===0)return [];
   // One extra call resolves every owner, which beats guessing at an
   // address derivation that depends on which token program was used.
   const infos=await mainnet().getMultipleParsedAccounts(addresses);
   return res.value.map((v,i)=>({
    address:v.address.toBase58(),
    amount:v.amount,
    owner:((infos.value[i]?.data as any)?.parsed?.info?.owner as string|undefined)??null,
   }));
  },
 };
}

/** The subset of observed order flow that the existing Features contract
 *  already has fields for. The richer flow measurements are stored
 *  alongside the assessment rather than squeezed in here. */
export type ObservedFlow={buys:number;sells:number;uniqueBuyers:number};

export function buildFeatures(
 candidate:Candidate,
 liquiditySol:number|null,
 facts:MintFacts,
 flow?:ObservedFlow,
):Features{
 return {
  ageSeconds:Math.max(0,Math.round((Date.now()-Date.parse(candidate.firstSeen))/1000)),
  // Holder counts and trade flow need indexing we do not run yet.
  holders:null,
  top10Pct:facts.top10Pct,
  floatHolders:facts.floatHolders,
  creatorLaunchCount:null,
  creatorGraduationCount:null,
  liquiditySol,
  marketCapSol:candidate.marketCapSol,
  buyCount:flow?.buys??null,
  sellCount:flow?.sells??null,
  uniqueBuyers:flow?.uniqueBuyers??null,
  mintAuthorityRevoked:facts.mintAuthorityRevoked,
  freezeAuthorityRevoked:facts.freezeAuthorityRevoked,
 };
}
