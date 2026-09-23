// Understanding a spoken buy that the exact-match parser did not.
//
// The deterministic parser in telegram/intent.ts is fast, free and offline,
// and it handles the phrasings it knows. It cannot handle every accent and
// every way a person says the same thing — "throw a dollar at", "get me a
// buck of", "lemme grab", a word whisper heard slightly wrong. This is the
// fallback for exactly those: an LLM that reads one transcript and returns a
// structured buy, or nothing.
//
// Three rules make it safe to put a model on the money path:
//
// 1. It only ever produces a BUY. Selling by voice stays a deliberate refusal
//    a uuid cannot be dictated, and a model must not be the thing that closes
//    the wrong position.
// 2. The amount is taken from the transcript, never invented. No number said,
//    no trade — the model returns none rather than guessing a figure.
// 3. It changes nothing on its own. The result flows to the same confirmation
//    keyboard as a typed /buy, so a misread still needs a human tap and can be
//    cancelled. The model widens what is understood, not what is spent.
//
// Unconfigured, or on any error or ambiguity, it returns null and the caller
// falls back to the normal refusal. A model that cannot be reached must never
// hold up a trade or invent one.

export type SpokenBuy=
 |{kind:'buyTrending';usd:number}
 |{kind:'buyTrending';sol:number}
 |{kind:'buyBySymbol';symbol:string;usd:number}
 |{kind:'buyBySymbol';symbol:string;sol:number};

const SYSTEM=`You read one short voice transcript from a crypto trading bot and
decide whether the speaker is asking to BUY a token, and if so, how much.

Return ONLY compact JSON, no prose. Shape:
{"buy": boolean, "amount": number|null, "unit": "usd"|"sol"|null,
 "target": "trending"|"symbol"|null, "symbol": string|null}

Rules you must follow exactly:
- "buy" is true only if the speaker clearly wants to purchase now. Questions,
  musings, or talk about selling are buy=false.
- NEVER infer an amount that was not said. If no quantity is spoken, amount is
  null and unit is null. Do not default to any number.
- "cents" or a bare "dollars"/"bucks" is unit "usd". Convert cents to a
  fraction: "fifty cents" -> amount 0.5, unit usd. "SOL" (often misheard as
  "sole", "soul", "sold") is unit "sol".
- target "trending" for "the dumbest/best/hottest meme coin", "whatever is
  trending", or no specific name. target "symbol" with the ticker in "symbol"
  only when a clear short token name is said (2-15 chars, letters/digits).
- If the speaker is trying to SELL, buy=false. Selling is handled elsewhere.
- If anything is unclear, buy=false. A false negative just asks the user to
  rephrase; a false positive spends money.`;

type Raw={buy?:unknown;amount?:unknown;unit?:unknown;target?:unknown;symbol?:unknown};

/** Turns the model's JSON into a SpokenBuy, or null if it is not a clean buy. */
export function toSpokenBuy(raw:Raw):SpokenBuy|null{
 if(raw?.buy!==true)return null;
 const amount=typeof raw.amount==='number'&&Number.isFinite(raw.amount)&&raw.amount>0
  ? raw.amount : null;
 if(amount===null)return null; // Rule 2: no amount, no trade.
 const unit=raw.unit==='usd'||raw.unit==='sol'?raw.unit:null;
 if(unit===null)return null;

 if(raw.target==='symbol'){
  const symbol=typeof raw.symbol==='string'?raw.symbol.trim():'';
  if(!/^[a-zA-Z0-9]{2,15}$/.test(symbol))return null;
  return unit==='usd'
   ? {kind:'buyBySymbol',symbol:symbol.toLowerCase(),usd:amount}
   : {kind:'buyBySymbol',symbol:symbol.toLowerCase(),sol:amount};
 }
 // Anything else is a pick from what is trending.
 return unit==='usd'?{kind:'buyTrending',usd:amount}:{kind:'buyTrending',sol:amount};
}

/**
 * Which held token a spoken name refers to, when plain matching could not
 * tell. The model is given the exact list the user holds and must return one
 * of those symbols or nothing — it cannot invent a token, only choose among
 * the ones already owned, so the worst case is "ask again", never a wrong
 * position closed.
 */
const RESOLVE_SYSTEM=`A user asked to sell a crypto token by saying its name
aloud, and speech-to-text may have garbled it. You are given the exact list of
token symbols they currently hold. Decide which one they meant.

Return ONLY compact JSON: {"symbol": string|null}
- "symbol" MUST be exactly one of the held symbols provided, copied verbatim,
  or null.
- Match by sound and meaning: "inu" or "e-nu" for SATOSHINU, "the cat" for a
  cat-themed token, "doge" for DOGE. Homophones and dropped syllables are
  expected.
- If two held tokens fit equally, or none clearly fits, return null. A wrong
  pick closes the wrong position; null just asks the user to repeat.`;

export type Interpreter={
 interpret(transcript:string):Promise<SpokenBuy|null>;
 /** One of `held`, or null when no single symbol clearly fits. */
 resolveSymbol(spokenName:string,held:string[]):Promise<string|null>;
};

const NULL:Interpreter={interpret:async()=>null,resolveSymbol:async()=>null};

export function openaiInterpreter(opts:{apiKey?:string;model?:string;baseUrl?:string}={}):Interpreter{
 const apiKey=opts.apiKey??process.env.OPENAI_API_KEY??'';
 const model=opts.model??process.env.VEYRO_INTENT_MODEL??'gpt-4o-mini';
 const baseUrl=opts.baseUrl??process.env.OPENAI_BASE_URL??'https://api.openai.com/v1';

 return {
  async interpret(transcript){
   const text=transcript.trim();
   if(!apiKey||!text||text.length>500)return null;
   try{
    const res=await fetch(baseUrl+'/chat/completions',{
     method:'POST',
     headers:{'content-type':'application/json',Authorization:'Bearer '+apiKey},
     signal:AbortSignal.timeout(12_000),
     body:JSON.stringify({
      model,
      temperature:0,
      response_format:{type:'json_object'},
      messages:[
       {role:'system',content:SYSTEM},
       {role:'user',content:text},
      ],
     }),
    });
    if(!res.ok)return null;
    const body=await res.json() as {choices?:{message?:{content?:string}}[]};
    const content=body.choices?.[0]?.message?.content;
    if(!content)return null;
    return toSpokenBuy(JSON.parse(content) as Raw);
   }catch{
    return null; // Unreachable or unparseable. The caller refuses normally.
   }
  },

  async resolveSymbol(spokenName,held){
   const name=spokenName.trim();
   if(!apiKey||!name||held.length===0)return null;
   try{
    const res=await fetch(baseUrl+'/chat/completions',{
     method:'POST',
     headers:{'content-type':'application/json',Authorization:'Bearer '+apiKey},
     signal:AbortSignal.timeout(12_000),
     body:JSON.stringify({
      model,temperature:0,response_format:{type:'json_object'},
      messages:[
       {role:'system',content:RESOLVE_SYSTEM},
       {role:'user',content:'Held: '+held.join(', ')+'\nThey said: '+name},
      ],
     }),
    });
    if(!res.ok)return null;
    const body=await res.json() as {choices?:{message?:{content?:string}}[]};
    const content=body.choices?.[0]?.message?.content;
    if(!content)return null;
    const picked=(JSON.parse(content) as {symbol?:unknown}).symbol;
    // The model must return one of the held symbols verbatim. Anything else
    // is discarded rather than trusted — it cannot name a token not held.
    return typeof picked==='string'&&held.includes(picked)?picked:null;
   }catch{
    return null;
   }
  },
 };
}

export function interpreter():Interpreter{
 if(process.env.VEYRO_VOICE_DISABLED==='true')return NULL;
 if(process.env.OPENAI_API_KEY)return openaiInterpreter();
 return NULL;
}
