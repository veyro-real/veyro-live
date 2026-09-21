// Order flow over an observation window.
//
// This is the measurement layer for the confirmation-snipe thesis: rather
// than judging a token at creation, watch who actually trades it for the
// first half minute and describe that. Everything here is descriptive. It
// says what happened, not what will.
//
// Pure, so the whole feature set can be tested against constructed trade
// sequences and later replayed over recorded ones.
//
// Note on what these can and cannot show. Buyer counts, sizes and timing are
// all cheap for a launch operator to manufacture with a pool of wallets, so
// none of these alone is evidence of genuine interest. They are the inputs a
// manipulation estimate has to be built from, not a substitute for one.

import type {Trade} from './trades';

export type FlowFeatures={
 trades:number;
 buys:number;
 sells:number;
 uniqueBuyers:number;
 uniqueSellers:number;
 buySol:number;
 sellSol:number;
 netSol:number;
 medianBuySol:number|null;
 /** Largest single buyer's share of buy volume. */
 topBuyerSharePct:number|null;
 top5BuyerSharePct:number|null;
 /** Distinct buyers per second across the window. */
 buyerVelocity:number|null;
 /** Change in the rate of first-time buyers, second half against first. */
 buyerAcceleration:number|null;
 /** 0 when every trade is the same size, approaching 1 when widely spread. */
 tradeSizeEntropy:number|null;
 /** Share of buyers who bought more than once. */
 repeatBuyerPct:number|null;
 /** Growth in the bonding curve's SOL across the window. */
 curveProgressSol:number|null;
 /** Creator buys minus creator sells. Null when no creator was supplied. */
 creatorNetSol:number|null;
};

const EMPTY:FlowFeatures={
 trades:0,buys:0,sells:0,uniqueBuyers:0,uniqueSellers:0,
 buySol:0,sellSol:0,netSol:0,medianBuySol:null,
 topBuyerSharePct:null,top5BuyerSharePct:null,buyerVelocity:null,
 buyerAcceleration:null,tradeSizeEntropy:null,repeatBuyerPct:null,
 curveProgressSol:null,creatorNetSol:null,
};

const round=(n:number,dp=6):number=>Number(n.toFixed(dp));

function median(values:number[]):number|null{
 if(values.length===0)return null;
 const s=[...values].sort((a,b)=>a-b);
 const mid=s.length>>1;
 return s.length%2?s[mid]:round((s[mid-1]+s[mid])/2);
}

/**
 * Shannon entropy of trade sizes bucketed by powers of two, normalised so
 * one bucket is 0 and a flat spread approaches 1. Size buckets rather than
 * raw values because the question is "how varied", not "how large".
 */
function sizeEntropy(sizes:number[]):number|null{
 if(sizes.length===0)return null;
 const buckets=new Map<number,number>();
 for(const v of sizes){
  const b=Math.floor(Math.log2(Math.max(v,1e-9)));
  buckets.set(b,(buckets.get(b)??0)+1);
 }
 if(buckets.size<=1)return 0;
 let h=0;
 for(const count of buckets.values()){
  const p=count/sizes.length;
  h-=p*Math.log2(p);
 }
 return round(h/Math.log2(buckets.size));
}

export function flowFeatures(
 all:Trade[],
 opts:{windowStart:number;windowEnd:number;creator?:string},
):FlowFeatures{
 const {windowStart,windowEnd,creator}=opts;
 const trades=all
  .filter(t=>t.at>=windowStart&&t.at<=windowEnd)
  .sort((a,b)=>a.at-b.at);
 if(trades.length===0){
  return {...EMPTY,creatorNetSol:creator?0:null};
 }

 const buys=trades.filter(t=>t.side==='buy');
 const sells=trades.filter(t=>t.side==='sell');
 const buySol=round(buys.reduce((s,t)=>s+t.solAmount,0));
 const sellSol=round(sells.reduce((s,t)=>s+t.solAmount,0));

 // Buy volume per wallet, for the concentration measures.
 const perBuyer=new Map<string,number>();
 const buyCount=new Map<string,number>();
 for(const t of buys){
  perBuyer.set(t.trader,(perBuyer.get(t.trader)??0)+t.solAmount);
  buyCount.set(t.trader,(buyCount.get(t.trader)??0)+1);
 }
 const ranked=[...perBuyer.values()].sort((a,b)=>b-a);
 const share=(n:number)=>buySol>0
  ? round(ranked.slice(0,n).reduce((s,v)=>s+v,0)/buySol*100,4)
  : null;

 // First-time buyers in each half: is the pool of participants still growing?
 const mid=windowStart+(windowEnd-windowStart)/2;
 const seen=new Set<string>();
 let firstHalfNew=0,secondHalfNew=0;
 for(const t of buys){
  if(seen.has(t.trader))continue;
  seen.add(t.trader);
  if(t.at<mid)firstHalfNew++;else secondHalfNew++;
 }
 const acceleration=perBuyer.size===0
  ? null
  : round((secondHalfNew-firstHalfNew)/Math.max(firstHalfNew,1));

 const curve=trades.map(t=>t.curveSol).filter((v):v is number=>v!==null);
 const windowSeconds=(windowEnd-windowStart)/1000;

 const creatorNet=creator===undefined
  ? null
  : round(trades.filter(t=>t.trader===creator)
     .reduce((s,t)=>s+(t.side==='buy'?t.solAmount:-t.solAmount),0));

 const repeaters=[...buyCount.values()].filter(c=>c>1).length;

 return {
  trades:trades.length,
  buys:buys.length,
  sells:sells.length,
  uniqueBuyers:perBuyer.size,
  uniqueSellers:new Set(sells.map(t=>t.trader)).size,
  buySol,sellSol,
  netSol:round(buySol-sellSol),
  medianBuySol:median(buys.map(t=>t.solAmount)),
  topBuyerSharePct:share(1),
  top5BuyerSharePct:share(5),
  buyerVelocity:windowSeconds>0?round(perBuyer.size/windowSeconds):null,
  buyerAcceleration:acceleration,
  tradeSizeEntropy:sizeEntropy(trades.map(t=>t.solAmount)),
  repeatBuyerPct:perBuyer.size>0?round(repeaters/perBuyer.size*100,4):null,
  curveProgressSol:curve.length>=2?round(curve[curve.length-1]-curve[0]):null,
  creatorNetSol:creatorNet,
 };
}
