// The rejection filter.
//
// This decides what a launch is disqualified for, and nothing more. It is not
// a prediction and the score is not a forecast: it ranks what survived on how
// much distinct participation was measured, so /scan has a stable order.
//
// Same rule as everywhere else in this codebase: an unmeasured safety
// property is a rejection, never a pass. "We could not read the mint
// authority" and "the mint authority is revoked" are not the same sentence.

import type {Assessment,Candidate,Features,RejectReason} from '../types';

/** Every threshold in one place so the bot can explain itself exactly. */
export const THRESHOLDS={
 maxTop10Pct:40,
 maxCreatorLaunches:25,
 rugLaunchCount:8,          // launches before "never graduates" means anything
 minLiquiditySol:1,
 minMarketCapSol:1,
 maxMarketCapSol:500_000,
 maxAgeSeconds:3600,
 minUniqueBuyers:5,
 bundledBuysPerBuyer:8,     // buys per distinct buyer above this looks bundled
 minFloatHolders:5,         // below this there is no distribution to judge
} as const;

export function assess(candidate:Candidate,features:Features):Assessment{
 const r:RejectReason[]=[];
 const f=features;

 // Authorities: null is unknown, and unknown is not revoked.
 if(f.mintAuthorityRevoked!==true)r.push('MINT_AUTHORITY_LIVE');
 if(f.freezeAuthorityRevoked!==true)r.push('FREEZE_AUTHORITY_LIVE');

 // Concentration is a safety claim, so unknown rejects -- but only once
 // there is something to concentrate. Seconds after launch a pump.fun
 // supply sits in protocol accounts with three or four holders behind it,
 // and "the top ten hold everything" is then a statement about the float
 // not existing yet, not about insiders. Too early to tell and failed to
 // measure are different, and conflating them rejected every launch.
 if(f.floatHolders!==null&&f.floatHolders<THRESHOLDS.minFloatHolders){
  // Not applicable at this stage.
 }else if(f.top10Pct===null||f.top10Pct>THRESHOLDS.maxTop10Pct){
  r.push('INSIDER_CONCENTRATION');
 }

 if(f.creatorLaunchCount!==null){
  if(f.creatorLaunchCount>THRESHOLDS.maxCreatorLaunches)r.push('CREATOR_SERIAL_LAUNCHER');
  // Launched repeatedly and never once graduated is the rug shape.
  if(f.creatorLaunchCount>=THRESHOLDS.rugLaunchCount&&(f.creatorGraduationCount??0)===0){
   r.push('CREATOR_PRIOR_RUG');
  }
 }

 if(f.liquiditySol!==null&&f.liquiditySol<THRESHOLDS.minLiquiditySol)r.push('LIQUIDITY_TOO_THIN');

 if(f.marketCapSol!==null&&
    (f.marketCapSol<THRESHOLDS.minMarketCapSol||f.marketCapSol>THRESHOLDS.maxMarketCapSol)){
  r.push('MARKET_CAP_OUT_OF_RANGE');
 }

 if(f.ageSeconds>THRESHOLDS.maxAgeSeconds)r.push('TOO_OLD');

 // No metadata at all means nothing to check a social presence against.
 if(!candidate.uri)r.push('NO_SOCIAL_FOOTPRINT');

 // Lots of buys spread across almost nobody is one actor in many wallets.
 if(f.buyCount!==null&&f.uniqueBuyers!==null&&f.uniqueBuyers>0&&
    f.buyCount/f.uniqueBuyers>THRESHOLDS.bundledBuysPerBuyer){
  r.push('BUNDLED_LAUNCH');
 }

 const passed=r.length===0;
 return {
  mint:candidate.mint,
  at:new Date().toISOString(),
  passed,
  rejections:r,
  score:passed?score(f):0,
  features:f,
 };
}

/** 0-100, and only meaningful for something that already passed. Distinct
 *  participation is weighted over raw activity, which one actor can fake. */
function score(f:Features):number{
 const band=(v:number|null,best:number)=>v===null?0:Math.min(1,v/best);
 const holders=band(f.holders,500);
 const buyers=band(f.uniqueBuyers,300);
 const liquidity=band(f.liquiditySol,100);
 // Fewer hands holding the top of the book is better.
 const spread=f.top10Pct===null?0:Math.max(0,1-f.top10Pct/THRESHOLDS.maxTop10Pct);
 const raw=holders*0.35+buyers*0.35+liquidity*0.15+spread*0.15;
 return Math.max(1,Math.round(raw*100));
}
