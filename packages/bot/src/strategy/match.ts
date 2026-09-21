// Does this candidate satisfy the user's compiled edge?
//
// One rule decides every ambiguous case: a clause the data cannot satisfy
// fails. An unmeasured holder count is not "probably fine", it is unknown,
// and unknown must never open a position. Failures are named so /scan and
// /why can say which clause it was rather than just "no".

import type {Assessment,Candidate,Strategy,StrategyMatch} from '../types';

export function matchStrategy(strategy:Strategy,candidate:Candidate,assessment:Assessment):StrategyMatch{
 const c=strategy.compiled,f=assessment.features;
 const failed:string[]=[];

 // The rejection filter is upstream of any strategy and outranks it.
 if(!assessment.passed)failed.push('rejectedByFilter');

 /** A numeric clause fails when unmeasured, and when the bound is broken. */
 const atLeast=(name:string,bound:number|null,value:number|null)=>{
  if(bound===null)return;
  if(value===null||value<bound)failed.push(name);
 };
 const atMost=(name:string,bound:number|null,value:number|null)=>{
  if(bound===null)return;
  if(value===null||value>bound)failed.push(name);
 };

 atLeast('minScore',c.minScore>0?c.minScore:null,assessment.score);
 atMost('maxAgeSeconds',c.maxAgeSeconds,f.ageSeconds);
 atLeast('minHolders',c.minHolders,f.holders);
 atMost('maxTop10Pct',c.maxTop10Pct,f.top10Pct);
 atLeast('minLiquiditySol',c.minLiquiditySol,f.liquiditySol);
 atMost('maxMarketCapSol',c.maxMarketCapSol,f.marketCapSol);
 atLeast('minMarketCapSol',c.minMarketCapSol,f.marketCapSol);
 atMost('maxCreatorLaunchCount',c.maxCreatorLaunchCount,f.creatorLaunchCount);
 atLeast('minUniqueBuyers',c.minUniqueBuyers,f.uniqueBuyers);

 // null is "we could not tell", which is not the same as revoked.
 if(c.requireMintAuthorityRevoked&&f.mintAuthorityRevoked!==true)failed.push('requireMintAuthorityRevoked');
 if(c.requireFreezeAuthorityRevoked&&f.freezeAuthorityRevoked!==true)failed.push('requireFreezeAuthorityRevoked');

 const haystack=(candidate.symbol+' '+candidate.name).toLowerCase();
 if(c.nameIncludes.length&&!c.nameIncludes.some(s=>haystack.includes(s)))failed.push('nameIncludes');
 if(c.nameExcludes.some(s=>haystack.includes(s)))failed.push('nameExcludes');

 return {strategyId:strategy.id,version:strategy.version,matched:failed.length===0,failedClauses:failed};
}
