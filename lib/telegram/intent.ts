// Spoken words to a command.
//
// Deliberately narrow. This maps a transcript onto the same Command union the
// text parser produces, and returns null the moment it is unsure. A bot that
// spends money must never act on a confident guess about what it half heard,
// so anything unrecognised becomes "I heard X, I did not understand it"
// rather than the nearest plausible command.
//
// Two things cannot be dictated at all: a 44-character base58 mint and a
// uuid position id. Buying is therefore expressed by symbol and resolved
// against what the feed has actually seen; selling by voice is refused.

import {parseCommand,type Command} from './parse';

export type Intent=Command|{kind:'buyBySymbol';symbol:string;sol:number};

/** Whisper reliably hears SOL as "sold", "soul" or "sole". */
const normalise=(raw:string):string=>raw
 .toLowerCase()
 .replace(/\bslash\s+/g,'/')
 .replace(/\b(sold|soul|sole|salt)\b/g,'sol')
 .replace(/[,!?]/g,' ')
 .replace(/\s+/g,' ')
 .trim();

const num=(s:string|undefined):number|null=>{
 if(s===undefined)return null;
 const n=Number(s);
 return Number.isFinite(n)&&n>0?n:null;
};

export function intentFromSpeech(raw:string):Intent|null{
 const t=normalise(raw);
 if(!t)return null;

 // Someone reading a command out loud, or typing one.
 if(t.startsWith('/')){
  const c=parseCommand(t);
  return c.kind==='unknown'?null:c;
 }

 // Stopping comes first: it must never be shadowed by another match.
 if(/\brevoke\b|stop everything|switch off (all )?spending|turn off (all )?spending/.test(t)){
  return {kind:'revoke'};
 }

 // Setting limits needs all three numbers. Two out of three is a refusal,
 // because the missing one would have to be invented.
 if(/\blimits?\b/.test(t)){
  const m=t.match(/([\d.]+)\s*sol[^\d]{0,30}?([\d.]+)\s*sol[^\d]{0,30}?([\d.]+)\s*hour/);
  if(m){
   const maxTradeSol=num(m[1]),dailyCapSol=num(m[2]),hours=num(m[3]);
   if(maxTradeSol!==null&&dailyCapSol!==null&&hours!==null&&dailyCapSol>=maxTradeSol){
    return {kind:'limits',set:{maxTradeSol,dailyCapSol,hours}};
   }
   return null;
  }
  // A number was mentioned but the instruction is incomplete.
  if(/\d/.test(t))return null;
  return {kind:'limits',set:null};
 }

 const edge=t.match(/(?:my (?:edge|strategy) is|set my (?:edge|strategy) to)\s+(.+)/);
 if(edge)return {kind:'edge',text:edge[1].trim()};

 if(/\bbuy\b/.test(t)){
  const m=t.match(/buy\s+([\d.]+)\s*sol\s+(?:of\s+|worth of\s+)?([a-z0-9]{2,15})\b/);
  const sol=num(m?.[1]);
  if(!m||sol===null)return null; // No amount, no trade.
  return {kind:'buyBySymbol',symbol:m[2],sol};
 }

 // A position id cannot be spoken, so this is always a refusal.
 if(/\bsell\b/.test(t))return null;

 if(/\bwallet\b|deposit address|my address/.test(t))return {kind:'wallet'};
 if(/\bpositions?\b|what am i holding|what do i hold|my bags/.test(t))return {kind:'positions',includeClosed:false};
 if(/\bscan\b|what passed|passed the filter|any candidates/.test(t))return {kind:'scan',limit:10};
 if(/\bedge\b|my strategy\b/.test(t))return {kind:'edge',text:null};
 if(/^help$|\bwhat can you do\b|list (your )?commands/.test(t))return {kind:'help'};

 return null;
}
