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

export type Intent=Command
 |{kind:'buyBySymbol';symbol:string;sol:number}
 |{kind:'buyBySymbol';symbol:string;usd:number}
 |{kind:'buyTrending';sol:number}
 |{kind:'buyTrending';usd:number}
 // A spoken sell names a token, not a uuid. Which held position it means is
 // resolved in the router against what the user actually holds, so a misheard
 // name matches nothing rather than closing the wrong thing.
 |{kind:'sellBySpokenName';name:string};

/** Whisper reliably hears SOL as "sold", "soul" or "sole". */
const normalise=(raw:string):string=>raw
 .toLowerCase()
 .replace(/\bslash\s+/g,'/')
 // "sell" is heard as "cell", "sale" and "sail"; normalise only at the start
 // of the utterance, where it is the verb, not inside a token name.
 .replace(/^(cell|sale|sail)\b/,'sell')
 .replace(/\b(sold|soul|sole|salt)\b/g,'sol')
 .replace(/[,!?]/g,' ')
 .replace(/\s+/g,' ')
 .trim();

const num=(s:string|undefined):number|null=>{
 if(s===undefined)return null;
 const n=Number(s);
 return Number.isFinite(n)&&n>0?n:null;
};

const ONES:Record<string,number>={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,
 eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,
 sixteen:16,seventeen:17,eighteen:18,nineteen:19};
const TENS:Record<string,number>={twenty:20,thirty:30,forty:40,fifty:50,sixty:60,
 seventy:70,eighty:80,ninety:90};

/**
 * "one hundred" to 100. Spoken amounts arrive as words, and an amount is the
 * one thing in a trade that must never be approximated, so an unrecognised
 * word ends the number rather than being skipped over.
 */
export function spokenNumber(phrase:string):number|null{
 let total=0,current=0,seen=false;
 // English writes tens before units within a group: "twenty five", never
 // "five twenty". A unit followed by a ten is a price said aloud — "three
 // fifty" is 3.50 — and adding them gave 53. Same for "eight sixty-nine"
 // (77) and "nine ninety nine" (108). Amounts are the one thing this module
 // will not approximate, so an ungrammatical sequence ends the number.
 let tens=false,units=false;
 for(const word of phrase.split(/[\s-]+/).filter(Boolean)){
  if(word in ONES){
   if(units)return null;
   current+=ONES[word];seen=true;units=true;
  }
  else if(word in TENS){
   if(tens||units)return null;
   current+=TENS[word];seen=true;tens=true;
  }
  else if(word==='hundred'){current=(current||1)*100;seen=true;tens=false;units=false;}
  else if(word==='thousand'){total+=(current||1)*1000;current=0;seen=true;tens=false;units=false;}
  else if(word==='and'&&seen)continue;
  else if(word==='a'&&!seen)continue; // "a hundred dollars"
  else return null;
 }
 const n=total+current;
 return seen&&n>0?n:null;
}

const MONEY='(?:dollars?|bucks|usd)';
// Under a dollar is the normal size for a demo or a first live trade, and
// "fifty cents" is how people say it. Without this it parses as fifty.
const CENTS='(?:cents?|c\\b)';

/**
 * The words immediately before a unit, as a number.
 *
 * "buy fifty dollars" captures "buy fifty", so the longest suffix that parses
 * wins: the surrounding sentence is discarded rather than failing the amount.
 */
function wordsBefore(t:string,unit:string):number|null{
 const m=t.match(new RegExp('((?:[a-z]+[\\s-]){1,4})'+unit));
 if(!m)return null;
 const parts=m[1].trim().split(/[\s-]+/);
 for(let i=0;i<parts.length;i++){
  const n=spokenNumber(parts.slice(i).join(' '));
  if(n!==null)return n;
 }
 return null;
}

/** A dollar amount anywhere in the utterance, digits or words. */
function usdFrom(t:string):number|null{
 // Cents first: "50 cents" also matches the bare-number dollar forms, and
 // reading it as fifty dollars is a hundredfold error in the spending
 // direction.
 const centDigits=num(t.match(new RegExp('([\\d.]+)\\s*'+CENTS))?.[1]);
 if(centDigits!==null)return centDigits/100;
 const centWords=wordsBefore(t,CENTS);
 if(centWords!==null)return centWords/100;

 const digits=t.match(new RegExp('\\$\\s*([\\d.]+)|([\\d.]+)\\s*'+MONEY));
 if(digits)return num(digits[1]??digits[2]);
 return wordsBefore(t,MONEY);
}

/** A SOL amount, in digits or words. */
function solFrom(t:string):number|null{
 const digits=num(t.match(/([\d.]+)\s*sol\b/)?.[1]);
 return digits!==null?digits:wordsBefore(t,'sol\\b');
}

/**
 * Ways of saying buy.
 *
 * Only verbs that mean nothing else. "grab" and "get" are excluded on
 * purpose: this branch refuses rather than falling through, so "grab my
 * positions" would return a refusal instead of the positions it asked for.
 */
const BUY_VERB=/\b(buy|buys|buying|bought|spend|spends|spending|spent|purchase|purchases|purchased|purchasing|ape|apes|aping|aped)\b/;

/** "the dumbest memecoin", "the best solana meme coin": a pick, not a symbol. */
const TRENDING=/dumbest|trending|whatever is hot|top meme|best(?:\s+\w+){0,2}\s+meme/;

/**
 * Why an utterance was refused, when it was understood and refused rather
 * than not understood at all.
 *
 * intentFromSpeech returns null for both, and the two deserve different
 * answers: "I did not understand it" is a lie when someone asked to sell
 * every coin they hold and the module deliberately declined. Returns null
 * when there is genuinely nothing to explain, so nothing is invented.
 */
export function refusalFor(raw:string):string|null{
 const t=normalise(raw);
 if(!t||t.startsWith('/'))return null;
 if(intentFromSpeech(raw))return null;

 if(/\bsell\b/.test(t)){
  // A named sell is handled now; only a nameless "sell everything" reaches
  // here, and that is refused because it does not say which position.
  return 'Say which one to sell — "sell INU", or the token\'s name. '+
   '/positions shows what you hold, and /sell <id> closes one exactly.';
 }

 if(BUY_VERB.test(t)){
  // An amount that was said but could not be read is a different problem
  // from no amount at all, and the fix for it is different too.
  const unreadable=/[a-z]+(?:[\s-][a-z]+)*\s*(?:dollars?|bucks|usd|cents?|sol)\b/.test(t)
   &&usdFrom(t)===null&&solFrom(t)===null;
  return unreadable
   ?'I heard an amount but could not read it. Say it as one number — '+
    '"three dollars fifty", or "3.50 dollars" — and I will not guess at it.'
   :'I heard a buy but no amount, and an amount is the one thing I will '+
    'not guess at. Say how much — "buy 0.1 sol of it", or "spend five dollars".';
 }

 // An amount and a target, but nothing that means buy. Naming the missing
 // word is more use than listing every command.
 if((usdFrom(t)!==null||solFrom(t)!==null)&&TRENDING.test(t)){
  return 'I heard an amount and what to put it in, but not whether to buy. '+
   'Say "buy" or "spend" — "spend 69 cents on the dumbest meme coin".';
 }

 if(/\blimits?\b/.test(t)){
  return 'Limits need all three numbers: per trade, per day, and for how '+
   'long. Say "limits 0.5 sol per trade, 2 sol a day, 24 hours".';
 }

 return null;
}

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

 if(BUY_VERB.test(t)){
  // Dollars first: "buy one hundred dollars of X" names its unit explicitly,
  // where a bare number after "buy" has always meant SOL.
  const usd=usdFrom(t);

  // No symbol, just a pick. The trade is still confirmed like any other.
  if(TRENDING.test(t)){
   if(usd!==null)return {kind:'buyTrending',usd};
   const sol=solFrom(t);
   return sol===null?null:{kind:'buyTrending',sol};
  }

  if(usd!==null){
   const m=t.match(/(?:worth of|of|on|into|in to)\s+(?:the\s+)?([a-z0-9]{2,15})\b/);
   return m?{kind:'buyBySymbol',symbol:m[1],usd}:null;
  }

  const m=t.match(/([\d.]+)\s*sol\s+(?:of\s+|worth of\s+|on\s+|into\s+)?(?:the\s+)?([a-z0-9]{2,15})\b/);
  const sol=num(m?.[1]);
  if(!m||sol===null)return null; // No amount, no trade.
  return {kind:'buyBySymbol',symbol:m[2],sol};
 }

 // A spoken sell names a token, not a uuid. "sell everything" and a bare
 // "sell" have no name to resolve, so they stay refusals; a name after sell
 // is handed to the router, which matches it against what the user holds.
 if(/\bsell\b/.test(t)){
  if(/sell (all|everything|it all|my bags|the lot|my position|my positions)\b/.test(t))return null;
  const m=t.match(/\bsell\s+(?:all (?:my|of my)\s+|my\s+|the\s+)?([a-z0-9][a-z0-9 ]{0,30}?)\s*(?:token|coin|position|bag)?$/);
  const name=m?.[1]?.trim();
  // A name that is only a generic word points at no token. Refuse it rather
  // than resolving "position" or "everything" against a held symbol.
  const generic=new Set(['all','everything','it','position','positions','bag','bags','token','coin','one','thing']);
  if(name&&!generic.has(name))return {kind:'sellBySpokenName',name};
  return null;
 }

 if(/\bwallet\b|deposit address|my address|add funds|fund my|top up/.test(t))return {kind:'wallet'};
 if(/\bpositions?\b|what am i holding|what do i hold|my bags/.test(t))return {kind:'positions',includeClosed:false};
 if(/\btrending\b|what is hot|whats hot/.test(t))return {kind:'trending',limit:5};
 if(/\bscan\b|what passed|passed the filter|any candidates/.test(t))return {kind:'scan',limit:10};
 if(/\bedge\b|my strategy\b/.test(t))return {kind:'edge',text:null};
 if(/^help$|\bwhat can you do\b|list (your )?commands/.test(t))return {kind:'help'};

 return null;
}
