// DexScreener as a trending source.
//
// Free, keyless and documented at 60 requests a minute, which makes it the
// cheapest way to answer "what is loud right now" without scraping anyone.
//
// One caution worth stating at the top, because it decides how the numbers
// may be used. A "boost" is a PAID placement. It measures who spent money on
// visibility, not who earned attention, so a high boost is a statement about
// the promoter's budget. That is still useful -- somebody thought this was
// worth paying for -- but it is not organic interest and must never be
// presented as if it were.
//
// Units are the other trap. marketCap, fdv and liquidity.usd are US dollars.
// Candidate.marketCapSol is SOL. Writing one into the other would be an
// invisible thousand-fold error in a field the filter reads, so USD figures
// are kept under names that say so and the SOL fields stay null unless a SOL
// amount was genuinely available.

import type {Candidate,Launchpad} from '../types';

const DEXES:Record<string,Launchpad>={
 pumpswap:'pumpswap',pumpfun:'pump.fun',raydium:'raydium',
};
/** Wrapped SOL. The only quote token whose amount is SOL. */
const WSOL='So11111111111111111111111111111111111111112';

const n=(v:unknown):number|null=>{
 const x=typeof v==='string'?Number(v):v;
 return typeof x==='number'&&Number.isFinite(x)?x:null;
};
const s=(v:unknown):string|null=>typeof v==='string'&&v.length>0?v:null;

export type Boost={
 mint:string;
 description:string;
 boost:number|null;
 links:string[];
};

/** A paid placement on DexScreener. Solana only. */
export function parseBoost(raw:unknown):Boost|null{
 if(!raw||typeof raw!=='object')return null;
 const b=raw as Record<string,any>;
 if(s(b.chainId)!=='solana')return null;
 const mint=s(b.tokenAddress);
 if(!mint)return null;
 return {
  mint,
  description:s(b.description)??'',
  boost:n(b.totalAmount),
  links:Array.isArray(b.links)?b.links.map((l:any)=>s(l?.url)).filter(Boolean) as string[]:[],
 };
}

export type PairSnapshot={
 candidate:Candidate;
 /** Only when the pair is quoted in SOL; null otherwise. */
 liquiditySol:number|null;
 liquidityUsd:number|null;
 marketCapUsd:number|null;
 volumeUsd5m:number|null;
 volumeUsd24h:number|null;
 buys5m:number|null;
 sells5m:number|null;
 ageSeconds:number;
 priceUsd:number|null;
};

export function parsePair(raw:unknown,now=Date.now()):PairSnapshot|null{
 if(!raw||typeof raw!=='object')return null;
 const p=raw as Record<string,any>;

 const mint=s(p.baseToken?.address);
 if(!mint)return null;

 const created=n(p.pairCreatedAt);
 const symbol=s(p.baseToken?.symbol)??mint.slice(0,4);
 const quoteIsSol=s(p.quoteToken?.address)===WSOL;

 return {
  candidate:{
   mint,
   symbol,
   name:s(p.baseToken?.name)??symbol,
   launchpad:DEXES[String(p.dexId??'')]??'unknown',
   // DexScreener does not report who deployed it. Saying "unknown" beats
   // inventing a creator that the rug checks would then reason about.
   creator:'unknown',
   firstSeen:new Date(created??now).toISOString(),
   initialBuySol:null,
   // Deliberately null: the figure available is USD, not SOL.
   marketCapSol:null,
   uri:s(p.info?.imageUrl),
  },
  liquiditySol:quoteIsSol?n(p.liquidity?.quote):null,
  liquidityUsd:n(p.liquidity?.usd),
  marketCapUsd:n(p.marketCap),
  volumeUsd5m:n(p.volume?.m5),
  volumeUsd24h:n(p.volume?.h24),
  buys5m:n(p.txns?.m5?.buys),
  sells5m:n(p.txns?.m5?.sells),
  ageSeconds:created===null?0:Math.max(0,Math.round((now-created)/1000)),
  priceUsd:n(p.priceUsd),
 };
}

const BASE='https://api.dexscreener.com';

/** 60 requests a minute, no key. Null on any failure; trending is optional. */
export function dexscreener(deps:{fetch?:typeof fetch}={}){
 const http=deps.fetch??fetch;
 const get=async(path:string):Promise<unknown|null>=>{
  try{
   const res=await http(BASE+path,{signal:AbortSignal.timeout(8000)});
   return res.ok?await res.json():null;
  }catch{
   return null;
  }
 };
 return {
  /** Paid placements, newest first. Solana only. */
  async trending():Promise<Boost[]>{
   const body=await get('/token-boosts/top/v1');
   return Array.isArray(body)
    ? body.map(parseBoost).filter((b):b is Boost=>b!==null)
    : [];
  },
  /** The deepest pair for a mint, which is the one worth judging. */
  async pair(mint:string):Promise<PairSnapshot|null>{
   const body=await get('/token-pairs/v1/solana/'+encodeURIComponent(mint));
   if(!Array.isArray(body)||body.length===0)return null;
   const best=body.reduce((a,b)=>
    ((b?.liquidity?.usd??0)>(a?.liquidity?.usd??0)?b:a));
   return parsePair(best);
  },
 };
}
