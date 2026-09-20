// Reply text. Pure functions, no I/O.
//
// House rules that this file enforces: say what was measured and what was
// rejected, never call the launch feed alpha or a prediction, and tell the
// user in plain language that the service holds their keys.

import type {Limits,Position} from '../types';
import type {ScanRow} from '../app';

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
 DAILY_CAP_EXCEEDED:'That would pass your daily cap for today.',
 INSUFFICIENT_BALANCE:'Your wallet does not hold enough SOL for that.',
 INVALID_AMOUNT:'That amount is not valid.',
 TRADING_DISABLED:'Trading is switched off on this deployment.',
 CANNOT_BUY_SOL:'SOL is what you are spending, so it cannot also be what you buy.',
 REQUEST_IN_FLIGHT:'That request is still running. Wait for it to finish.',
 REQUEST_ALREADY_HANDLED:'That request was already handled.',
};

export const denial=(reason:string):string=>DENIALS[reason]??('The trade did not go through: '+reason+'.');

export function help():string{
 return [
  'What I answer:',
  '/start — what this bot is and what it holds',
  '/connect — link your x.com account',
  '/wallet — your deposit address and balance',
  '/limits — show limits, or /limits <max trade SOL> <daily cap SOL> <hours>',
  '/revoke — switch off all spending now',
  '/edge — show your strategy, or /edge <plain English>',
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
};

export const usage=(command:string):string=>USAGE[command]??help();

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

export function scan(rows:ScanRow[]):string{
 if(rows.length===0)return 'Nothing passed the filter yet. Try again once the feed has seen more launches.';
 return rows.map(r=>{
  const m=r.match;
  return [
   r.candidate.symbol+' — score '+r.assessment.score,
   '  '+r.candidate.mint,
   m?('  strategy: '+(m.matched?'matched':'no match ('+m.failedClauses.join(', ')+')')):'',
  ].filter(Boolean).join('\n');
 }).join('\n\n');
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
export function confirm(mint:string,solAmount:number,row:ScanRow|null):string{
 const head='Buy '+solAmount+' SOL';
 const tail='Real funds, and it cannot be undone.';
 if(!row){
  return [
   head+' of',
   mint,
   '',
   'I have no measurement for this token. It was never assessed here, so '+
   'nothing below the filter has checked it.',
   '',
   tail,
  ].join('\n');
 }
 const a=row.assessment,f=a.features;
 const facts=[
  'score '+a.score,
  f.top10Pct===null?null:('float top-10 '+f.top10Pct+'%'),
  f.liquiditySol===null?null:('liquidity '+f.liquiditySol+' SOL'),
 ].filter(Boolean).join(' · ');
 const authorities=[
  f.mintAuthorityRevoked===true?'mint authority revoked':'mint authority NOT revoked',
  f.freezeAuthorityRevoked===true?'freeze revoked':'freeze NOT revoked',
 ].join(' · ');
 return [
  row.candidate.symbol+' · '+row.candidate.name,
  head,
  '',
  facts,
  authorities,
  'first seen '+f.ageSeconds+'s ago',
  '',
  mint,
  '',
  tail,
 ].join('\n');
}
