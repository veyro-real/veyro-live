// Jupiter swap API. Quote, build, sign, simulate, send.
//
// lite-api.jup.ag is the keyless tier and will rate-limit under real volume;
// set JUPITER_API_URL to api.jup.ag with JUPITER_API_KEY before that matters.

import {Keypair,VersionedTransaction} from '@solana/web3.js';
import type {SwapQuote} from '../types';
import {mainnet} from '../wallet/custody';

export const SOL_MINT='So11111111111111111111111111111111111111112';

const base=()=>(process.env.JUPITER_API_URL||'https://lite-api.jup.ag').replace(/\/$/,'');
const slippageBps=()=>{
 const raw=Number(process.env.VEYRO_MAX_SLIPPAGE_BPS||300);
 if(!Number.isFinite(raw)||raw<1||raw>5000)throw Error('INVALID_SLIPPAGE_CONFIG');
 return Math.round(raw);
};
const priorityFee=()=>{
 const raw=Number(process.env.VEYRO_PRIORITY_FEE_LAMPORTS||200_000);
 return Number.isFinite(raw)&&raw>=0?Math.round(raw):200_000;
};

function headers():Record<string,string>{
 const h:Record<string,string>={'Content-Type':'application/json'};
 const key=process.env.JUPITER_API_KEY;
 if(key)h['x-api-key']=key;
 return h;
}

export async function quote(inputMint:string,outputMint:string,amount:bigint):Promise<SwapQuote&{raw:unknown}>{
 const u=new URL(base()+'/swap/v1/quote');
 u.searchParams.set('inputMint',inputMint);
 u.searchParams.set('outputMint',outputMint);
 u.searchParams.set('amount',amount.toString());
 u.searchParams.set('slippageBps',String(slippageBps()));
 // Direct routes only would miss most memecoin pairs; allow the full router
 // but cap hops so the transaction stays inside one block's compute budget.
 u.searchParams.set('maxAccounts','40');
 const res=await fetch(u,{headers:headers(),signal:AbortSignal.timeout(12_000)});
 if(!res.ok)throw Error('JUPITER_QUOTE_'+res.status);
 const body=await res.json();
 if(!body?.outAmount||BigInt(body.outAmount)<=0n)throw Error('NO_ROUTE');
 return {
  inputMint,outputMint,
  inLamports:amount.toString(),
  outAmount:String(body.outAmount),
  minOutAmount:String(body.otherAmountThreshold),
  priceImpactPct:Number(body.priceImpactPct||0),
  slippageBps:Number(body.slippageBps||slippageBps()),
  routePlan:body.routePlan,
  raw:body,
 };
}

/** Returns an unsigned v0 transaction built for `owner`. */
export async function buildSwap(quoteRaw:unknown,owner:string):Promise<VersionedTransaction>{
 const res=await fetch(base()+'/swap/v1/swap',{
  method:'POST',headers:headers(),signal:AbortSignal.timeout(15_000),
  body:JSON.stringify({
   quoteResponse:quoteRaw,
   userPublicKey:owner,
   wrapAndUnwrapSol:true,
   dynamicComputeUnitLimit:true,
   prioritizationFeeLamports:{priorityLevelWithMaxLamports:{maxLamports:priorityFee(),priorityLevel:'high'}},
  }),
 });
 if(!res.ok)throw Error('JUPITER_SWAP_'+res.status+'_'+(await res.text()).slice(0,120));
 const body=await res.json();
 if(!body?.swapTransaction)throw Error('JUPITER_NO_TRANSACTION');
 return VersionedTransaction.deserialize(Buffer.from(body.swapTransaction,'base64'));
}

/**
 * Sign, prove the signature is valid against live state, then send.
 *
 * The simulate is not optional. It is the last point where a bad route, a
 * stale blockhash or a broken signature costs nothing. Past `sendRawTransaction`
 * the outcome is the chain's to decide and ours to reconcile.
 */
export async function signSimulateSend(tx:VersionedTransaction,signer:Keypair):Promise<string>{
 tx.sign([signer]);
 const sim=await mainnet().simulateTransaction(tx,{sigVerify:true,commitment:'confirmed'});
 if(sim.value.err){
  throw Error('SIMULATION_FAILED_'+JSON.stringify(sim.value.err).slice(0,120));
 }
 return mainnet().sendRawTransaction(tx.serialize(),{
  skipPreflight:true, // already simulated
  maxRetries:3,
 });
}

/** Resolves to the outcome, or throws TIMEOUT leaving the position UNKNOWN. */
export async function confirm(signature:string,timeoutMs=60_000):Promise<'FINALIZED'|'FAILED'>{
 const deadline=Date.now()+timeoutMs;
 while(Date.now()<deadline){
  const {value}=await mainnet().getSignatureStatuses([signature],{searchTransactionHistory:true});
  const status=value[0];
  if(status?.err)return 'FAILED';
  if(status?.confirmationStatus==='finalized'||status?.confirmationStatus==='confirmed')return 'FINALIZED';
  await new Promise(r=>setTimeout(r,2_000));
 }
 throw Error('CONFIRM_TIMEOUT');
}

/** Token balance change for `mint` in a settled transaction. */
export async function tokensReceived(signature:string,owner:string,mint:string):Promise<string|null>{
 const tx=await mainnet().getTransaction(signature,{maxSupportedTransactionVersion:0,commitment:'confirmed'});
 if(!tx?.meta)return null;
 const after=tx.meta.postTokenBalances?.find(b=>b.mint===mint&&b.owner===owner);
 const before=tx.meta.preTokenBalances?.find(b=>b.mint===mint&&b.owner===owner);
 if(!after)return null;
 const delta=BigInt(after.uiTokenAmount.amount)-BigInt(before?.uiTokenAmount.amount||'0');
 return delta>0n?delta.toString():null;
}
