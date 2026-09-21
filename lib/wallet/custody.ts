// Custodied trading wallets.
//
// The service holds these keys. That is the trust boundary and the product
// says so to the user before they deposit. Secrets are AES-256-GCM encrypted
// under VEYRO_CREDENTIALS_KEY, live only in veyro_secrets, and never touch
// disk, logs or any API response.

import {Keypair,Connection,PublicKey,LAMPORTS_PER_SOL} from '@solana/web3.js';
import {encryptSecret,decryptSecret} from '../credentials';
import {getSecret,saveSecret} from '../store';
import {setUserWallet} from '../db';

const secretId=(userId:string)=>'wallet:'+userId;

let connection:Connection|undefined;
export function mainnet():Connection{
 if(!connection){
  const url=process.env.SOLANA_MAINNET_RPC_URL||process.env.SOLANA_MAINNET_READ_RPC_URL;
  if(!url)throw Error('MAINNET_RPC_NOT_CONFIGURED');
  connection=new Connection(url,{commitment:'confirmed'});
 }
 return connection;
}

/** Creates the wallet on first call, returns the existing one after. */
export async function ensureKeypair(userId:string):Promise<Keypair>{
 const existing=await loadKeypair(userId);
 if(existing)return existing;
 const kp=Keypair.generate();
 await saveSecret(secretId(userId),encryptSecret(Buffer.from(kp.secretKey).toString('base64')));
 await setUserWallet(userId,kp.publicKey.toBase58());
 return kp;
}

export async function loadKeypair(userId:string):Promise<Keypair|null>{
 const box=await getSecret(secretId(userId));
 if(!box)return null;
 const raw=decryptSecret(box);
 if(!raw)throw Error('WALLET_DECRYPT_FAILED');
 return Keypair.fromSecretKey(Buffer.from(raw,'base64'));
}

export async function balanceLamports(pubkey:string):Promise<bigint>{
 return BigInt(await mainnet().getBalance(new PublicKey(pubkey),'confirmed'));
}

/** Balance minus the headroom a swap needs for fees, rent and the wSOL
 *  account Jupiter opens and closes. Never let a user spend into this. */
export const FEE_BUFFER_LAMPORTS=12_000_000n; // ~0.012 SOL

export async function spendableLamports(pubkey:string):Promise<bigint>{
 const balance=await balanceLamports(pubkey);
 return balance>FEE_BUFFER_LAMPORTS?balance-FEE_BUFFER_LAMPORTS:0n;
}

export const solToLamports=(sol:number):bigint=>{
 if(!Number.isFinite(sol)||sol<=0)throw Error('INVALID_AMOUNT');
 return BigInt(Math.round(sol*LAMPORTS_PER_SOL));
};
export const lamportsToSol=(lamports:bigint|string):number=>Number(BigInt(lamports))/LAMPORTS_PER_SOL;
