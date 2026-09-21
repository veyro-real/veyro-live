// Parsing the PumpPortal launch feed.
//
// Pure: takes one decoded websocket message, returns what it is. The socket
// itself lives in worker/feed.ts because Next.js cannot hold one open.
//
// The feed sends subscription acknowledgements and trade events down the same
// socket as launches, so anything we do not recognise is ignored rather than
// coerced into a candidate.

import type {Candidate,Launchpad} from '../types';

export type FeedMessage=
 |{kind:'candidate';candidate:Candidate;liquiditySol:number|null;bondingCurveKey:string|null}
 |{kind:'migration';mint:string};

const POOLS:Record<string,Launchpad>={pump:'pump.fun',pumpswap:'pumpswap',raydium:'raydium'};

/** A number we actually measured, or null. Never a silent zero. */
const n=(v:unknown):number|null=>typeof v==='number'&&Number.isFinite(v)?v:null;
const s=(v:unknown):string|null=>typeof v==='string'&&v.length>0?v:null;

export function parseFeedMessage(raw:unknown):FeedMessage|null{
 if(!raw||typeof raw!=='object')return null;
 const m=raw as Record<string,unknown>;

 const mint=s(m.mint);
 if(!mint)return null;

 const txType=s(m.txType);
 if(txType==='migrate')return {kind:'migration',mint};
 if(txType!=='create')return null;

 const launchpad=POOLS[String(m.pool??'')]??'unknown';
 const symbol=s(m.symbol)??mint.slice(0,4);

 return {
  kind:'candidate',
  candidate:{
   mint,
   symbol,
   name:s(m.name)??symbol,
   launchpad,
   creator:s(m.traderPublicKey)??'unknown',
   firstSeen:new Date().toISOString(),
   initialBuySol:n(m.solAmount),
   marketCapSol:n(m.marketCapSol),
   uri:s(m.uri),
  },
  // The virtual SOL side of the bonding curve is the tradable depth.
  liquiditySol:n(m.vSolInBondingCurve),
  // Needed so concentration measures the float and not the unsold supply.
  bondingCurveKey:s(m.bondingCurveKey),
 };
}
