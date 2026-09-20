// When to close a position.
//
// Deliberately a pure decision: it takes a valuation and returns a verdict,
// so the rules can be tested exhaustively without a chain, and so the worker
// that acts on them has no judgement of its own.
//
// Two rules of precedence. Time beats everything, because the clock is the
// only input that cannot be wrong. Stop loss beats take profit, because when
// rules contradict, the one that protects capital wins.
//
// An unpriceable position is never sold. A failed quote is not a price of
// zero, and treating it as one would dump a position into a route that did
// not answer.

export type ExitRules={
 takeProfitPct:number|null;
 stopLossPct:number|null;
 /** Drawdown from the highest valuation seen, not from entry. */
 trailingPct:number|null;
 maxHoldSeconds:number|null;
};

export const NO_EXIT_RULES:ExitRules={
 takeProfitPct:null,stopLossPct:null,trailingPct:null,maxHoldSeconds:null,
};

export type ExitReason='TAKE_PROFIT'|'STOP_LOSS'|'TRAILING_STOP'|'MAX_HOLD';
export type ExitDecision={sell:false}|{sell:true;reason:ExitReason};

const HOLD:ExitDecision={sell:false};

export function decideExit(input:{
 entryLamports:bigint;
 /** Current exit value from a live quote. Zero means we could not price it. */
 currentLamports:bigint;
 /** Highest valuation seen for this position, never below entry. */
 peakLamports:bigint;
 openedAt:string;
 now:number;
 rules:ExitRules;
 /**
  * Total round-trip cost as a percentage: the launchpad's fee both ways,
  * plus whatever the routing layer takes. On pump.fun through PumpPortal
  * Local this is several percent, which is why it cannot be ignored. Set it
  * from configuration rather than assuming a number that changes.
  */
 roundTripCostPct?:number;
}):ExitDecision{
 const {entryLamports,currentLamports,rules}=input;
 const cost=input.roundTripCostPct??0;

 // A target smaller than the cost of trading can never be met net, and a
 // rule that can never fire is a bug rather than a conservative setting.
 if(rules.takeProfitPct!==null&&cost>0&&rules.takeProfitPct<=cost){
  throw Error('UNREACHABLE_TAKE_PROFIT: '+rules.takeProfitPct+
   '% target cannot clear a '+cost+'% round trip');
 }

 // The clock needs no valuation, so it is checked first and outranks the rest.
 if(rules.maxHoldSeconds!==null){
  const heldSeconds=(input.now-Date.parse(input.openedAt))/1000;
  if(heldSeconds>rules.maxHoldSeconds)return {sell:true,reason:'MAX_HOLD'};
 }

 if(entryLamports<=0n||currentLamports<=0n)return HOLD;

 // Basis points in bigint, not percentages in floating point. 2.4/3 - 1 is
 // -19.999999999999996, which is not <= -20, and a trailing stop that fails
 // to fire on the exact threshold is a bug you only find with real money.
 const bps=(pct:number)=>BigInt(Math.round(pct*100));
 const value=currentLamports*10_000n;

 if(rules.stopLossPct!==null&&value<=entryLamports*bps(100-rules.stopLossPct)){
  return {sell:true,reason:'STOP_LOSS'};
 }
 // Gross move needed so the net move hits the target.
 if(rules.takeProfitPct!==null&&value>=entryLamports*bps(100+rules.takeProfitPct+cost)){
  return {sell:true,reason:'TAKE_PROFIT'};
 }
 if(rules.trailingPct!==null){
  // A peak below entry has not been observed yet; entry is the floor.
  const peak=input.peakLamports>entryLamports?input.peakLamports:entryLamports;
  if(value<=peak*bps(100-rules.trailingPct))return {sell:true,reason:'TRAILING_STOP'};
 }

 return HOLD;
}
