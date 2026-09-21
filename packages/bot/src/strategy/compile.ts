// Plain English to a CompiledStrategy.
//
// Deterministic and offline. The same sentence always compiles to the same
// clauses, which is what makes /edge auditable: a user can be shown exactly
// what their words became before any money is involved.
//
// Anything not recognised is simply absent. A clause that was never
// understood must never become a clause that permits more, so every default
// is the restrictive one and autoExecute is opt-in on an explicit phrase.

import type {CompiledStrategy} from '../types';
import {solToLamports} from '../wallet/custody';

const DEFAULT_POSITION_LAMPORTS='100000000'; // 0.1 SOL

/** First capture group of the first pattern that matches, as a number. */
function num(text:string,patterns:RegExp[]):number|null{
 for(const re of patterns){
  const m=text.match(re);
  if(m){
   const n=Number(m[1]);
   if(Number.isFinite(n))return n;
  }
 }
 return null;
}

const list=(raw:string|null):string[]=>
 raw===null?[]:raw.split(/[,;]| and /).map(s=>s.trim().toLowerCase()).filter(Boolean);

export function compileStrategy(rawText:string):CompiledStrategy{
 const t=rawText.toLowerCase();

 const seconds=num(t,[/(\d+(?:\.\d+)?)\s*(?:s|sec|secs|seconds?)\b[^.]{0,12}old/,/old[^.]{0,12}?(\d+(?:\.\d+)?)\s*(?:s|sec|secs|seconds?)\b/]);
 const minutes=num(t,[/(\d+(?:\.\d+)?)\s*(?:m|min|mins|minutes?)\b[^.]{0,12}old/]);

 const includes=t.match(/name includes ([^.;]+?)(?:,\s*(?:exclude|excluding|not)\b|[.;]|$)/);
 const excludes=t.match(/(?:exclude|excluding|not in the name|no)\s+([^.;]+?)(?:[.;]|$)/);

 const positionSol=num(t,[/buy\s+(\d+(?:\.\d+)?)\s*sol/,/(\d+(?:\.\d+)?)\s*sol\s+(?:each|per)\b/]);

 return {
  minScore:num(t,[/score\s+(?:above|over|at least|>=?)\s*(\d+(?:\.\d+)?)/])??0,
  maxAgeSeconds:seconds??(minutes===null?null:Math.round(minutes*60)),
  minHolders:num(t,[/(?:at least|min|minimum|over|more than)\s*(\d+)\s*holders?/]),
  maxTop10Pct:num(t,[/top\s*10[^.]{0,20}?(?:under|below|less than|<)\s*(\d+(?:\.\d+)?)\s*%/]),
  minLiquiditySol:num(t,[/(?:at least|min|minimum|over|more than)\s*(\d+(?:\.\d+)?)\s*sol\s*(?:of\s*)?liquidity/,/liquidity\s*(?:of\s*)?(?:at least|over|above)\s*(\d+(?:\.\d+)?)\s*sol/]),
  maxMarketCapSol:num(t,[/market cap[^.]{0,30}?(?:under|below|less than|<)\s*(\d+(?:\.\d+)?)\s*sol/]),
  minMarketCapSol:num(t,[/market cap[^.]{0,30}?(?:over|above|at least|more than|>)\s*(\d+(?:\.\d+)?)\s*sol/]),
  maxCreatorLaunchCount:num(t,[/creator[^.]{0,40}?(?:at most|no more than|under|fewer than|max)\s*(\d+)/]),
  minUniqueBuyers:num(t,[/(?:at least|min|minimum|over|more than)\s*(\d+)\s*(?:unique\s*)?buyers?/]),
  requireMintAuthorityRevoked:/mint authority\s*(?:is\s*)?(?:revoked|renounced|burned)/.test(t),
  requireFreezeAuthorityRevoked:/freeze authority\s*(?:is\s*)?(?:revoked|renounced|burned)/.test(t),
  nameIncludes:list(includes?.[1]??null),
  nameExcludes:list(excludes?.[1]??null),
  positionLamports:positionSol===null?DEFAULT_POSITION_LAMPORTS:solToLamports(positionSol).toString(),
  // Never inferred. A user has to ask for it in words.
  autoExecute:/\bauto(?:matically|-?execute|\s*execute|\s*buy)?\b/.test(t)&&/\bauto/.test(t)&&/automatic|auto-?execute|auto\s*buy|automatically/.test(t),
 };
}
