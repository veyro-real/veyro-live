// What the bot says out loud.
//
// Spoken text is not the written text read aloud. A 44-character base58 mint
// takes about forty seconds to spell out and tells you nothing, and a URL is
// worse. So this is a summary built for ears: the amount, the token, the one
// or two numbers that matter, and whether it was measured at all.
//
// The same rule as the written copy applies. Nothing here forecasts a price.

import type {ScanRow} from '../app';

/** Roughly forty seconds of speech. Past that nobody is listening. */
export const MAX_SPOKEN=600;

const MINT_LIKE=/\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g;
const URL_LIKE=/\bhttps?:\/\/\S+/gi;

/** Make arbitrary reply text safe and sensible to speak. */
export function speakable(text:string):string{
 const cleaned=text
  .replace(URL_LIKE,'')
  // A mint is identified by its first few characters, not all forty-four.
  .replace(MINT_LIKE,m=>m.slice(0,4))
  // "/limits" should be heard as a word, not a slash.
  .replace(/\/([a-z]+)/gi,'$1')
  .replace(/[·•—–*_`>#]/g,' ')
  .replace(/\s+/g,' ')
  .trim();
 if(!/[a-z0-9]/i.test(cleaned))return '';
 return cleaned.length<=MAX_SPOKEN?cleaned:cleaned.slice(0,MAX_SPOKEN).replace(/\s\S*$/,'');
}

export function spokenConfirm(sol:number,row:ScanRow|null,mint:string):string{
 if(!row){
  return speakable(
   'Confirm buying '+sol+' SOL of '+mint.slice(0,4)+'. '+
   'This token was never measured here, so nothing has checked it.');
 }
 const f=row.assessment.features;
 const bits=[
  'Confirm buying '+sol+' SOL of '+row.candidate.symbol+'.',
  'Score '+row.assessment.score+'.',
  f.top10Pct===null?null:('Top ten holders hold '+Math.round(f.top10Pct)+' percent of the float.'),
  f.mintAuthorityRevoked===true?'Mint authority is revoked.':'Mint authority is not revoked.',
  'First seen '+f.ageSeconds+' seconds ago.',
 ].filter(Boolean);
 return speakable(bits.join(' '));
}

export function spokenScan(rows:ScanRow[]):string{
 if(rows.length===0)return speakable('Nothing passed the filter yet.');
 const best=rows.reduce((a,b)=>b.assessment.score>a.assessment.score?b:a);
 return speakable(
  rows.length+' candidate'+(rows.length===1?'':'s')+' passed the filter. '+
  'Highest score '+best.assessment.score+', '+best.candidate.symbol+'.');
}
