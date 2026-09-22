// Turning a dollar amount into lamports.
//
// Limits, positions and the spend ledger are lamports end to end. A user who
// says "buy one hundred dollars" is asking for a quantity this system has no
// unit for, so it is converted once, here, at the edge — and the trade that
// follows is an ordinary SOL-denominated trade.
//
// The rate is Jupiter's own quote for selling one SOL, which is the price the
// router would actually give rather than a reference feed that disagrees with
// it. A quote that cannot be had is a refusal: inventing a rate would size a
// real trade off a guess.

import {SOL_MINT} from './jupiter';

/** Circle's USDC on Solana mainnet. Used to read a price, never as an input. */
export const USDC_MINT='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

const ONE_SOL=1_000_000_000n;
const USDC_DECIMALS=1_000_000;

// A rate is a divisor, so a wrong one does not fail — it silently resizes the
// trade. At $0.01 a SOL, "$100" would ask for 10,000 SOL. Refuse instead.
const MIN_USD=1,MAX_USD=100_000;

export type PriceDeps={
 quote(inputMint:string,outputMint:string,amount:bigint):Promise<{outAmount:string}>;
};

/** What one SOL sells for, in dollars. */
export async function solPriceUsd(deps:PriceDeps):Promise<number>{
 const {outAmount}=await deps.quote(SOL_MINT,USDC_MINT,ONE_SOL);
 const usd=Number(BigInt(outAmount))/USDC_DECIMALS;
 if(!Number.isFinite(usd)||usd<MIN_USD||usd>MAX_USD)throw Error('IMPLAUSIBLE_SOL_PRICE');
 return usd;
}

export type DollarAmount={lamports:bigint;solPriceUsd:number};

/** Throws rather than returning an approximation the caller might spend. */
export async function usdToLamports(usd:number,deps:PriceDeps):Promise<DollarAmount>{
 if(!Number.isFinite(usd)||usd<=0)throw Error('INVALID_AMOUNT');
 const price=await solPriceUsd(deps);
 const lamports=BigInt(Math.round((usd/price)*Number(ONE_SOL)));
 if(lamports<=0n)throw Error('INVALID_AMOUNT');
 return {lamports,solPriceUsd:price};
}

/**
 * The same conversion as a refusal rather than a throw, for the channel layer
 * where an unreadable rate is something to tell the user, not an exception.
 */
export async function usdToSolOrNull(usd:number,deps:PriceDeps):Promise<number|null>{
 try{
  const {lamports}=await usdToLamports(usd,deps);
  return Number(lamports)/Number(ONE_SOL);
 }catch{
  return null;
 }
}
