// Building a MoonPay on-ramp link.
//
// The consumer widget makes the buyer type a destination address, which is
// the step non-technical people abandon: a 44-character base58 string, pasted
// by hand, irreversible if wrong. MoonPay's partner integration exists to
// remove it — their docs say a partner that knows the address must pass it —
// and passing it requires signing the query string with the secret key.
//
// Signing is mandatory, not optional hardening: an unsigned URL carrying
// walletAddress will not load. The signature binds the address and the amount
// to our account, so nothing between here and the browser can swap either.
//
// Unconfigured, this returns null and the caller falls back to the plain
// consumer link. A missing key must degrade to "paste it yourself", never to
// an unsigned link that silently fails to open.

import {createHmac} from 'node:crypto';

export type OnrampLink={url:string;prefilled:boolean};

const CONSUMER_URL='https://buy.moonpay.com/?defaultCurrencyCode=sol';

/** Live keys buy real crypto; test keys do not. Both sign the same way. */
const keys=()=>({
 publishable:process.env.MOONPAY_PUBLISHABLE_KEY??'',
 secret:process.env.MOONPAY_SECRET_KEY??'',
 base:process.env.MOONPAY_WIDGET_URL??'https://buy.moonpay.com',
});

/**
 * HMAC-SHA256 of the query string, base64, over the secret key.
 *
 * The signed message includes the leading '?', which is easy to get wrong
 * and produces a signature MoonPay rejects without saying why.
 */
export function signQuery(search:string,secret:string):string{
 return createHmac('sha256',secret).update(search).digest('base64');
}

/** Appends a valid signature to an otherwise complete widget URL. */
export function signUrl(url:string,secret:string):string{
 const signature=signQuery(new URL(url).search,secret);
 return url+'&signature='+encodeURIComponent(signature);
}

/**
 * Where to send someone who needs SOL.
 *
 * With partner keys the destination and amount are filled in and signed, so
 * the buyer only chooses how to pay. Without them, the plain consumer link,
 * where the address is pasted by hand.
 */
export function onrampLink(opts:{pubkey:string;usdAmount?:number}):OnrampLink{
 const {publishable,secret,base}=keys();
 if(!publishable||!secret)return {url:CONSUMER_URL,prefilled:false};

 const u=new URL(base);
 u.searchParams.set('apiKey',publishable);
 u.searchParams.set('currencyCode','sol');
 u.searchParams.set('walletAddress',opts.pubkey);
 // A suggested amount, not a fixed one: the buyer can still change it, and
 // pinning it would strand anyone whose card declines the exact figure.
 if(opts.usdAmount!==undefined&&Number.isFinite(opts.usdAmount)&&opts.usdAmount>0){
  u.searchParams.set('baseCurrencyCode','usd');
  u.searchParams.set('baseCurrencyAmount',opts.usdAmount.toFixed(2));
 }
 return {url:signUrl(u.toString(),secret),prefilled:true};
}
