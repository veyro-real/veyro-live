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

const TOKEN_PROGRAM=new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ASSOCIATED_TOKEN_PROGRAM=new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');

export type MintInfo={
 mintAuthority:string|null;
 freezeAuthority:string|null;
 supply:string;
 decimals:number;
};

export type TokenAccount={address:string;amount:string};

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
};

const UNKNOWN:MintFacts={mintAuthorityRevoked:null,freezeAuthorityRevoked:null,top10Pct:null};

/** The associated token account a bonding curve holds its supply in. Pure
 *  address derivation, no RPC call. */
export function curveTokenAccount(curveOwner:string,mint:string):string{
 const [address]=PublicKey.findProgramAddressSync(
  [new PublicKey(curveOwner).toBuffer(),TOKEN_PROGRAM.toBuffer(),new PublicKey(mint).toBuffer()],
  ASSOCIATED_TOKEN_PROGRAM,
 );
 return address.toBase58();
}

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
  top10Pct:await concentration(mint,reader,info.supply,bondingCurveKey),
 };
}

async function concentration(
 mint:string,
 reader:ChainReader,
 rawSupply:string,
 bondingCurveKey?:string|null,
):Promise<number|null>{
 try{
  let supply=BigInt(rawSupply);
  if(supply<=0n)return null;

  let accounts=await reader.largestAccounts(mint);

  if(bondingCurveKey){
   const curve=curveTokenAccount(bondingCurveKey,mint);
   const held=accounts.filter(a=>a.address===curve)
    .reduce((sum,a)=>sum+BigInt(a.amount),0n);
   accounts=accounts.filter(a=>a.address!==curve);
   supply-=held;
   // Everything still in the curve means there is no float to judge yet.
   if(supply<=0n)return null;
  }

  const top=accounts.slice(0,10).reduce((sum,a)=>sum+BigInt(a.amount),0n);
  // Basis points first, so integer maths does the rounding.
  return Number((top*10000n)/supply)/100;
 }catch{
  return null;
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
   return res.value.map(v=>({address:v.address.toBase58(),amount:v.amount}));
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
