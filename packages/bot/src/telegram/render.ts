// Reply text. Pure functions, no I/O.
//
// House rules that this file enforces: say what was measured and what was
// rejected, never call the launch feed alpha or a prediction, and tell the
// user in plain language that the service holds their keys.

import type {Limits,Position} from '../types';
import {FEE_BUFFER_LAMPORTS} from '../wallet/custody';
import type {BuyPreview,ScanRow,TrendingRow} from '../app';
import type {InlineKeyboard} from './types';

/** Lamports as SOL, exact, with no trailing zeros. Never rounded for display. */
export function sol(lamports:bigint|string):string{
 const n=typeof lamports==='bigint'?lamports:BigInt(lamports||'0');
 const neg=n<0n,abs=neg?-n:n;
 const frac=(abs%1000000000n).toString().padStart(9,'0').replace(/0+$/,'');
 return (neg?'-':'')+(abs/1000000000n).toString()+(frac?'.'+frac:'');
}

export const CUSTODY=
 'Custody: this bot holds your keys. The private key to your trading wallet '+
 'is held by this service, not by you. If the service is compromised, the '+
 'funds in that wallet are gone. Only deposit what you can afford to lose.';

/** Every denial the money path can return, in plain language. */
const DENIALS:Record<string,string>={
 NO_LIMITS_SET:'You have not set spending limits yet. Use /limits first.',
 LIMITS_REVOKED:'Your spending limits are revoked. Set them again with /limits.',
 LIMITS_EXPIRED:'Your spending limits have expired. Set them again with /limits.',
 MAX_TRADE_EXCEEDED:'That is larger than your per-trade maximum.',
 ABOVE_HARD_CAP:'That is over the hard cap set for this deployment. Your own '+
  'limits cannot raise it — an operator sets it outside the bot.',
 DAILY_CAP_EXCEEDED:'That would pass your daily cap for today.',
 INSUFFICIENT_BALANCE:'Your wallet does not hold enough SOL for that.',
 INVALID_AMOUNT:'That amount is not valid.',
 TRADING_DISABLED:'Trading is switched off on this deployment.',
 CANNOT_BUY_SOL:'SOL is what you are spending, so it cannot also be what you buy.',
 REQUEST_IN_FLIGHT:'That request is still running. Wait for it to finish.',
 REQUEST_ALREADY_HANDLED:'That request was already handled.',
 POSITION_ALREADY_OPEN:'You already hold an open position in this token. '+
  '/positions shows it, and /sell closes it before you buy more.',
 PAPER_OPEN_FAILED:'The simulated position could not be opened. Nothing was spent.',
 OPEN_POSITION_FAILED:'The position could not be opened. Nothing was spent.',
};

export const denial=(reason:string):string=>DENIALS[reason]??('The trade did not go through: '+reason+'.');

/**
 * Anything that reaches the router's catch. Codes are for us; this is what
 * the user reads. Unknown failures still show their message rather than a
 * shrug, because a message we have not seen before is the one worth reading.
 */
const FAILURES:[RegExp,string][]=[
 [/CREDENTIALS_KEY_MISMATCH/,
  'This wallet cannot be opened. Its key was written before a security '+
  'rotation, so the service can no longer sign for it. Nothing has been '+
  'spent. Do not deposit to it — ask an operator to reset it first.'],
 [/SUPABASE_NOT_CONFIGURED|SUPABASE_STORE_ERROR|DB_/,
  'Something went wrong on our side, not yours. Nothing was spent. Try again '+
  'in a moment.'],
 [/MAINNET_RPC_NOT_CONFIGURED|RPC_/,
  'I could not reach Solana just now. Nothing was spent. Try again shortly.'],
];

export function failure(message:string):string{
 for(const [pattern,text] of FAILURES)if(pattern.test(message))return text;
 return 'That failed: '+message;
}

/**
 * A trade that was sent but has not confirmed yet.
 *
 * It may still land, so it must not read as a failure. The signature is what
 * lets someone check for themselves.
 */
export function unresolved(signature:string,positionId:string):string{
 return [
  'Sent, but not confirmed yet. It may still land.',
  '',
  'Do not send it again — a second one would be a second trade.',
  '/positions will show it once it settles, either way.',
  '',
  'Signature: '+signature,
  positionId?('Position: '+positionId):'',
 ].filter(Boolean).join('\n');
}

export function help():string{
 return [
  'What I answer:',
  '/start — what this bot is and what it holds',
  '/tutorial — a seven step walkthrough of everything here',
  '/mode — paper or live, or /paper and /live to switch',
  '/connect — link your x.com account (not available yet)',
  '/wallet (or /fund) — your deposit address and balance',
  '/limits — show limits, or /limits <max trade SOL> <daily cap SOL> <hours>',
  '/revoke — switch off all spending now',
  '/edge — show your strategy, or /edge <plain English>',
  '/trending — what is loud right now, from paid DexScreener placements',
  '/scan — candidates that passed the filter',
  '/why <mint> — what was measured and what was rejected',
  '/buy <mint> <SOL> — buy, after you confirm',
  '/sell <position id> — close a position',
  '/positions — open positions, or /positions all',
  '/voice — speak confirmations as well as writing them',
  '/help — this list',
 ].join('\n');
}

const USAGE:Record<string,string>={
 limits:'/limits <max trade SOL> <daily cap SOL> <hours>, for example /limits 0.5 2 24. The daily cap cannot be below the per-trade maximum.',
 buy:'/buy <mint> <SOL>, for example /buy Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB 0.25',
 why:'/why <mint> — the mint address of the token.',
 sell:'/sell <position id> — the id shown by /positions.',
 scan:'/scan, or /scan <how many>.',
 mode:'/mode, or /mode paper, or /mode live.',
};

export const usage=(command:string):string=>USAGE[command]??help();

/**
 * Where a user buys SOL.
 *
 * MoonPay's consumer flow, which takes Apple Pay and lands SOL on Solana.
 * Deliberately carries no destination address: the onramp would treat a
 * prefilled address as the buyer's own self-custody wallet, and this one is
 * custodial. Under the Travel Rule a hosted destination needs the custodian
 * registered, which Veyro is not. The user pastes it themselves.
 */
export const ONRAMP_URL='https://buy.moonpay.com/?defaultCurrencyCode=sol';

/**
 * A buy that stopped for want of SOL.
 *
 * Refusing with "not enough SOL" and nothing else ends the conversation at
 * the exact moment the user has said what they want. They know they are
 * short; what they need is the address, the number, and a way to pay. The
 * trade is held so it can finish once the money lands.
 *
 * The onramp link still carries no destination address. It opens a hosted
 * page where Apple Pay is one of the methods, and the address is pasted by
 * the person who owns the card — every provider requires the buyer to own
 * the destination, and this wallet is custodial.
 */
export function needsFunding(opts:{
 pubkey:string;
 haveLamports:bigint;
 needLamports:bigint;
 symbol:string|null;
 /** Callback data for the retry button. */
 retryData:string;
 /** Where to buy SOL. Prefilled only through a signed partner link. */
 onramp?:{url:string;prefilled:boolean};
}):{text:string;keyboard:InlineKeyboard}{
 // What must arrive, not what the swap costs: the fee buffer is held back
 // from every balance, so funding only the difference still refuses.
 const target=opts.needLamports+FEE_BUFFER_LAMPORTS;
 const short=target>opts.haveLamports?target-opts.haveLamports:0n;

 const text=[
  'Not enough SOL yet'+(opts.symbol?(' to buy '+opts.symbol):'')+'.',
  '',
  'In your wallet: '+sol(opts.haveLamports)+' SOL',
  'This trade needs: '+sol(opts.needLamports)+' SOL, plus '+
   sol(FEE_BUFFER_LAMPORTS)+' SOL kept back for network fees',
  'So send at least: '+sol(short)+' SOL',
  '',
  'Your deposit address:',
  opts.pubkey,
  '',
  opts.onramp?.prefilled
   ? 'Buy SOL below. The card page takes Apple Pay, and the address above is '+
     'already filled in — you only choose how much and how to pay.'
   : 'Buy SOL below — the card page takes Apple Pay — then paste that address '+
     'as the destination.',
  '',
  'Funds take a few minutes to arrive. Tap "I have funded it" when they do '+
  'and I will finish this trade.',
  '',
  CUSTODY,
 ].join('\n');

 return {text,keyboard:[
  [{text:'Buy SOL with a card',url:opts.onramp?.url??ONRAMP_URL}],
  [{text:'I have funded it',callback_data:opts.retryData}],
 ]};
}

export function walletMessage(
 pubkey:string,lamports:string|null,onramp?:{url:string;prefilled:boolean},
):{
 text:string;keyboard:InlineKeyboard;
}{
 const balance=lamports===null
  ? 'Balance: could not be read just now. Your funds are not affected; try again in a moment.'
  : 'Balance: '+sol(lamports)+' SOL';

 const text=[
  'Your deposit address:',
  pubkey,
  '',
  balance,
  '',
  onramp?.prefilled
   ? 'To fund it: tap below. The address is already filled in for you.'
   : 'To fund it: buy SOL, then send it to the address above.',
  '',
  'Send SOL on Solana and nothing else. A different coin, or SOL on another '+
  'chain, is lost and cannot be recovered.',
  '',
  'Keep about 0.012 SOL spare for network fees, or the next trade fails.',
  '',
  CUSTODY,
 ].join('\n');

 return {text,keyboard:[[{text:'Buy SOL with a card',url:onramp?.url??ONRAMP_URL}]]};
}

export function mode(m:'paper'|'live',paperLamports:string):string{
 if(m==='paper'){
  return [
   'Paper trading. Trades are simulated at live Jupiter quotes, so the '+
   'prices and slippage are real and the SOL is not.',
   '',
   'Simulated balance: '+sol(paperLamports)+' SOL',
   '',
   'Nothing you do here touches your wallet or the chain. Switch with /live '+
   'when you want real money, and set /limits first.',
  ].join('\n');
 }
 return [
  'Live trading. Trades spend the real SOL in your custodial wallet.',
  '',
  'Your limits still gate every trade, and /revoke stops all of it.',
  'Switch back any time with /paper.',
 ].join('\n');
}

/** Said once, when a funded wallet is given its first limits. */
export function limitsOpened(l:Limits):string{
 return [
  'You had no spending limits, so I set these from your balance:',
  '  Per trade: '+sol(l.maxTradeLamports)+' SOL',
  '  Daily cap: '+sol(l.dailyCapLamports)+' SOL',
  '  They expire in 24 hours.',
  'Change them with /limits, or switch spending off with /revoke.',
 ].join('\n');
}

export function limits(l:Limits|null):string{
 if(!l||!l.active)return 'No spending limits are set. Nothing can be spent until you set them with /limits.';
 const when=new Date(l.expiresAt*1000).toISOString().replace('T',' ').slice(0,16)+' UTC';
 return [
  'Per trade: '+sol(l.maxTradeLamports)+' SOL',
  'Daily cap: '+sol(l.dailyCapLamports)+' SOL',
  'Expires: '+when,
  l.policyAddress?('On-chain policy: '+l.policyAddress):'On-chain policy: not deployed. Limits are enforced by the database only.',
 ].join('\n');
}

export function positions(list:Position[]):string{
 if(list.length===0)return 'No positions.';
 return list.map(p=>[
  p.symbol+' — '+p.status,
  '  id '+p.id,
  '  in '+sol(p.entryLamports)+' SOL'+(p.tokensReceived?(' for '+p.tokensReceived+' tokens'):''),
  p.exitLamports?('  out '+sol(p.exitLamports)+' SOL'):'',
  p.reason?('  '+p.reason):'',
 ].filter(Boolean).join('\n')).join('\n\n');
}

/** Callback prefix for the per-candidate explain button. */
export const WHY='y:';

/**
 * The confirmation for a sell resolved from a spoken name.
 *
 * Names the exact position so a wrong match is caught by eye before the tap,
 * not after. A sell returns funds and needs no spend reservation, so the only
 * guard that matters is that the human sees which token is about to close.
 */
export function confirmSell(p:Position):string{
 return [
  'Sell '+p.symbol+'?',
  '',
  (p.tokensReceived?p.tokensReceived+' tokens':'this position')+
   ', bought for '+sol(p.entryLamports)+' SOL',
  'Position '+p.id,
  '',
  'Real funds, back to SOL. This cannot be undone.',
 ].join('\n');
}

/** When a spoken name matched nothing, or matched several. */
export function sellNoMatch(spoken:string,holdings:Position[]):string{
 if(holdings.length===0)return 'You have no open positions to sell.';
 const held=holdings.map(p=>'  '+p.symbol+' — '+p.id).join('\n');
 return [
  'I heard "sell '+spoken+'" but could not tell which of these you meant:',
  '',
  held,
  '',
  'Say the name again, or paste it — or use /sell <id> with one of the ids above.',
 ].join('\n');
}

/** Most buttons one message carries before the keyboard stops being usable. */
const MAX_BUTTONS=8;

const age=(seconds:number):string=>{
 if(seconds<90)return Math.max(1,Math.round(seconds))+'s old';
 if(seconds<5400)return Math.round(seconds/60)+'m old';
 return Math.round(seconds/3600)+'h old';
};

/** A measurement that was not taken is unknown. It is never rendered as 0:
 *  a reader cannot tell an absent number from a real zero, and the two mean
 *  opposite things about a token. */
const measured=(value:number|null,unit:(n:number)=>string):string|null=>
 value===null?null:unit(value);

const trim=(n:number,places=1):string=>{
 const fixed=n.toFixed(places);
 return fixed.endsWith('.0')?fixed.slice(0,-2):fixed;
};

export function scan(rows:ScanRow[]):{text:string;keyboard:InlineKeyboard}{
 if(rows.length===0){
  return {
   text:'Nothing passed the filter yet. The feed keeps reading launches; '+
        'try again in a minute.',
   keyboard:[],
  };
 }

 const lines=rows.map((r,i)=>{
  const f=r.assessment.features;
  const facts=[
   measured(f.holders,n=>n+' holders'),
   measured(f.uniqueBuyers,n=>n+' buyers'),
   measured(f.liquiditySol,n=>trim(n)+' SOL liquidity'),
   measured(f.top10Pct,n=>'top 10 hold '+Math.round(n)+'%'),
  ].filter(Boolean) as string[];
  const unknown=4-facts.length;
  if(unknown>0)facts.push(unknown===4?'nothing measured yet':unknown+' unknown');

  const strategy=r.match
   ?(r.match.matched?'matches your edge':'off your edge: '+r.match.failedClauses.join(', '))
   :null;

  return [
   `${i+1}. $${r.candidate.symbol} — ${age(f.ageSeconds)}`,
   '   '+facts.join(' · '),
   strategy?'   '+strategy:'',
   '   '+r.candidate.mint,
  ].filter(Boolean).join('\n');
 });

 const head=rows.length===1
  ?'1 launch passed the filter.'
  :rows.length+' launches passed the filter, newest first.';

 const text=[
  head,
  '',
  lines.join('\n\n'),
  '',
  'Passing means none of the rejection tests failed. It is not a view on '+
  'where the price goes. Tap a name for the measurement behind it.',
 ].join('\n');

 const keyboard:InlineKeyboard=rows.slice(0,MAX_BUTTONS)
  .map(r=>[{text:'Why $'+r.candidate.symbol,callback_data:WHY+r.candidate.mint}]);

 return {text,keyboard};
}

export function why(row:ScanRow|null,mint:string):string{
 if(!row)return 'No measurement for '+mint+'. It was never assessed here.';
 const a=row.assessment,f=a.features;
 const measured=Object.entries(f)
  .filter(([,v])=>v!==null&&v!==undefined)
  .map(([k,v])=>'  '+k+': '+String(v));
 return [
  row.candidate.symbol+' ('+row.candidate.mint+')',
  a.passed?('Passed the filter. Score '+a.score+'.'):'Rejected.',
  a.rejections.length?('Rejections: '+a.rejections.join(', ')):'',
  measured.length?('Measured:\n'+measured.join('\n')):'',
 ].filter(Boolean).join('\n');
}

/**
 * The buy confirmation. Every line is something that was measured, or a
 * plain statement that it was not. Nothing here forecasts a price, because
 * the filter measures disqualifiers and has no opinion about what goes up.
 */
/** Decimals are the token's own; without them an amount is not a quantity. */
const units=(raw:string,decimals:number|null):string=>{
 if(decimals===null)return raw;
 const n=BigInt(raw),d=BigInt(10)**BigInt(decimals);
 // Grouped: a memecoin balance runs to seven figures and an ungrouped one
 // cannot be read at a glance, which is the only way anyone reads this.
 const whole=(n/d).toString().replace(/\B(?=(\d{3})+(?!\d))/g,',');
 const frac=(n%d).toString().padStart(decimals,'0').replace(/0+$/,'');
 return frac?whole+'.'+frac.slice(0,2):whole;
};

/**
 * What the trade will actually do, when we could price it.
 *
 * Jupiter is an aggregator, so naming it says nothing about where the
 * liquidity is. The venue is the answer to "who am I buying from".
 */
export function quoteLines(q:BuyPreview['quote'],decimals:number|null=null):string[]{
 if(!q)return ['Could not price this route just now.'];
 const venue=q.route.length?(' · via '+q.route[0]):'';
 return [
  'Price impact '+q.priceImpactPct.toFixed(2)+'% · min '+
   units(q.minOutAmount,decimals)+' after slippage'+venue,
 ];
}

export function confirm(
 mint:string,solAmount:number,row:ScanRow|null,paper=false,preview?:BuyPreview,
):string{
 const symbol=row?.candidate.symbol??preview?.symbol??null;
 const name=row?.candidate.name??preview?.name??null;
 const title=symbol&&name&&name!==symbol?(symbol+' · '+name):(symbol??name);

 // The headline is what is being bought and what comes back. Everything
 // else is a qualifier on that line, and the mint is reference rather than
 // part of the decision, so it sits at the bottom.
 const out=preview?.quote
  ? ' \u2192 about '+units(preview.quote.outAmount,preview.decimals??null)+
    (symbol?(' '+symbol):'')
  : '';
 const head='Buy '+solAmount+' SOL'+out;

 const tail=paper
  ? 'Paper trade. Simulated at a live quote; no SOL moves and no transaction exists.'
  : 'Real funds, and it cannot be undone.';

 const priced=preview?quoteLines(preview.quote,preview.decimals??null):[];

 if(!row){
  return [
   title,
   head,
   '',
   ...priced,
   'Never assessed by the filter, so nothing here has checked it.',
   '',
   tail,
   '',
   mint,
  ].filter(l=>l!==null&&l!==undefined).join('\n');
 }

 const a=row.assessment,f=a.features;
 const facts=[
  'score '+a.score,
  f.top10Pct===null?null:('float top-10 '+f.top10Pct+'%'),
  f.liquiditySol===null?null:('liquidity '+f.liquiditySol+' SOL'),
  f.ageSeconds===null?null:('first seen '+f.ageSeconds+'s ago'),
 ].filter(Boolean).join(' · ');
 const authorities=[
  f.mintAuthorityRevoked===true?'mint authority revoked':'mint authority NOT revoked',
  f.freezeAuthorityRevoked===true?'freeze revoked':'freeze NOT revoked',
 ].join(' · ');

 return [
  title,
  head,
  '',
  ...priced,
  facts,
  authorities,
  '',
  tail,
  '',
  mint,
 ].filter(l=>l!==null&&l!==undefined).join('\n');
}

/** What a spoken instruction was understood to mean, for the confirmation. */
export function describeIntent(intent:{kind:string;[k:string]:any}):string{
 switch(intent.kind){
  case 'limits':return intent.set
   ? 'Set your limits to '+intent.set.maxTradeSol+' SOL per trade, '+
     intent.set.dailyCapSol+' SOL a day, for '+intent.set.hours+' hours.'
   : 'Show your limits.';
  case 'revoke':return 'Revoke all spending immediately.';
  case 'edge':return intent.text?('Replace your strategy with: '+intent.text):'Show your strategy.';
  case 'voice':return intent.on?'Turn voice notes on.':'Turn voice notes off.';
  default:return 'Run '+intent.kind+'.';
 }
}

/**
 * What is loud right now. Every line is a measurement, and the footer is not
 * decoration: a boost is a paid placement, and letting that read as organic
 * interest would be the same lie as calling the launch feed alpha.
 */
export function trending(rows:TrendingRow[]):string{
 if(rows.length===0)return 'Nothing trending right now. Try again shortly.';
 const body=rows.map(r=>{
  const age=r.ageSeconds<3600
   ? Math.round(r.ageSeconds/60)+'m old'
   : Math.round(r.ageSeconds/3600)+'h old';
  const flow=r.buys5m===null||r.sells5m===null
   ? null
   : ('5m trades '+r.buys5m+' buys / '+r.sells5m+' sells');
  return [
   r.symbol+' — '+r.name,
   '  '+r.mint,
   '  '+[age,
        r.liquiditySol===null?null:('liquidity '+Math.round(r.liquiditySol)+' SOL'),
        r.marketCapUsd===null?null:('mcap $'+r.marketCapUsd.toLocaleString('en-US')),
       ].filter(Boolean).join(' · '),
   flow?('  '+flow):'',
   r.description?('  '+r.description.slice(0,90)):'',
  ].filter(Boolean).join('\n');
 }).join('\n\n');
 return body+'\n\nThese are paid promotions on DexScreener, ranked by what the '+
  'promoter spent. That is a budget, not interest, and none of it has been '+
  'through the rejection filter. Buy with /buy <mint> <SOL>.';
}
