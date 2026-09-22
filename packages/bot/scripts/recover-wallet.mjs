// Recover a bot-custodied wallet's private key as a Phantom-importable string.
//
// The bot generates each wallet itself and stores the secret key AES-256-GCM
// encrypted in veyro_secrets. This decrypts one and prints it, so funds are
// never stranded behind a service that is down, renamed, or gone.
//
// Run it only on a machine you trust, and never paste the output anywhere.
//
//   cd packages/bot && SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//   VEYRO_CREDENTIALS_KEY=... node scripts/recover-wallet.mjs [walletPubkey]
//
// It lives in packages/bot because that is where its dependencies are
// installed; from the repository root node cannot resolve them.
//
// With no argument it lists every wallet it can decrypt and their balances.

import {createDecipheriv,createHash} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {Keypair} from '@solana/web3.js';

// Inlined so recovery needs no install: a wallet you cannot open because a
// dependency is missing is not a recovery path.
const B58='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function base58(bytes){
 let n=0n;
 for(const b of bytes)n=n*256n+BigInt(b);
 let out='';
 while(n>0n){out=B58[Number(n%58n)]+out;n/=58n;}
 for(const b of bytes){if(b===0)out='1'+out;else break;}
 return out;
}

const {SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,VEYRO_CREDENTIALS_KEY}=process.env;
for(const [k,v] of Object.entries({SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,VEYRO_CREDENTIALS_KEY})){
 if(!v){console.error('missing env: '+k);process.exit(1);}
}
const RPC=process.env.SOLANA_MAINNET_RPC_URL||process.env.SOLANA_MAINNET_READ_RPC_URL
 ||'https://api.mainnet-beta.solana.com';

const aesKey=createHash('sha256').update(VEYRO_CREDENTIALS_KEY).digest();
const decrypt=(box)=>{
 const {iv,tag,value}=box??{};
 if(!iv||!tag||!value)return null;
 try{
  const d=createDecipheriv('aes-256-gcm',aesKey,Buffer.from(iv,'base64'));
  d.setAuthTag(Buffer.from(tag,'base64'));
  return Buffer.concat([d.update(Buffer.from(value,'base64')),d.final()]).toString('utf8');
 }catch{return null;}
};

const balance=async(pubkey)=>{
 const r=await fetch(RPC,{method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({jsonrpc:'2.0',id:1,method:'getBalance',params:[pubkey]})});
 return (await r.json())?.result?.value??0;
};

const db=createClient(SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,
 {auth:{persistSession:false,autoRefreshToken:false}});
const {data,error}=await db.from('veyro_secrets').select('id,encrypted_value').like('id','wallet:%');
if(error){console.error('supabase:',error.message);process.exit(1);}

const want=process.argv[2];
let found=0;

for(const row of data??[]){
 const raw=decrypt(row.encrypted_value);
 if(!raw){console.log(row.id,'-> CANNOT DECRYPT under this VEYRO_CREDENTIALS_KEY');continue;}
 const kp=Keypair.fromSecretKey(Buffer.from(raw,'base64'));
 const pubkey=kp.publicKey.toBase58();
 if(want&&want!==pubkey)continue;
 found++;
 const lamports=await balance(pubkey);
 console.log('\nuser      :',row.id.slice('wallet:'.length));
 console.log('address   :',pubkey);
 console.log('balance   :',(lamports/1e9).toFixed(9),'SOL');
 if(want){
  console.log('\nPhantom import key (base58) — treat as cash, never paste it anywhere:\n');
  console.log(base58(kp.secretKey));
 }
}

if(!found)console.log(want?('no wallet matching '+want):'no wallets found');
else if(!want)console.log('\nRe-run with an address to print its importable key.');
