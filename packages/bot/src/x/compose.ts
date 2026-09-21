// What the bot says on X.
//
// Pure, so the house rules can be enforced by tests rather than by
// remembering them: say what was measured and what was rejected, never
// describe a candidate as alpha or a prediction, no hype.
//
// Two rules specific to posting in public rather than to one user in
// Telegram. A trade is announced only after it has settled, because posting
// an intention is an invitation to be front-run by anyone reading. And a
// full mint is never posted, because a 44-character address in a public
// post is a copy-paste target for a lookalike.

import type {Position,RejectReason} from '../types';
import {sol} from '../telegram/render';

/** X's limit. Nothing here is allowed to rely on truncation. */
export const LIMIT=280;

const shortMint=(mint:string)=>mint.slice(0,4)+'…'+mint.slice(-4);

/** Trim to the limit on a word boundary, never mid-word. */
const fit=(text:string):string=>
 text.length<=LIMIT?text:text.slice(0,LIMIT-1).replace(/\s\S*$/,'')+'…';

export function postTrade(
 position:Position,
 measured:{score:number;top10Pct:number|null},
):string|null{
 // Only a settled fill. OPENING has not proven anything and FAILED moved
 // no value, so neither is a trade worth announcing.
 if(position.status!=='OPEN'&&position.status!=='CLOSED')return null;
 if(!position.entrySignature)return null;

 const facts=[
  'score '+measured.score,
  measured.top10Pct===null?null:('float top-10 '+Math.round(measured.top10Pct)+'%'),
 ].filter(Boolean).join(' · ');

 return fit([
  'Bought '+sol(position.entryLamports)+' SOL of '+position.symbol+
   ' ('+shortMint(position.mint)+')',
  facts,
  'Measured, not predicted. Most launches are rejected.',
 ].join('\n'));
}

export function postRejectionDigest(d:{
 measured:number;
 rejected:number;
 top:[string,number][];
}):string|null{
 if(d.measured===0)return null; // Nothing happened; say nothing.
 const reasons=d.top.slice(0,3).map(([reason,n])=>reason+' '+n).join(' · ');
 return fit([
  'Measured '+d.measured+' launches. Rejected '+d.rejected+'.',
  reasons,
  'What was rejected is the interesting part.',
 ].filter(Boolean).join('\n'));
}

export function postReply(
 mint:string,
 assessment:{passed:boolean;score:number;rejections:RejectReason[]|string[]}|null,
):string|null{
 if(!assessment){
  return fit(shortMint(mint)+'\nNo measurement. This one was never assessed here.');
 }
 if(!assessment.passed){
  return fit([
   shortMint(mint)+' — rejected.',
   assessment.rejections.join(' · '),
  ].join('\n'));
 }
 return fit([
  shortMint(mint)+' — passed the filter. Score '+assessment.score+'.',
  'Passing means nothing disqualifying was measured. It is not a view on price.',
 ].join('\n'));
}
