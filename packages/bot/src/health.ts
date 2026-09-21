// Dependency health, for the status page.
//
// Two rules hold here.
//
// 1. A health check must never be able to take the service down. Every probe
//    is timed out and every throw is caught, so a hung dependency reports a
//    failure instead of hanging the request.
// 2. A health check must never leak a credential. Probe failures carry
//    upstream error text, and upstream libraries put URLs and keys in their
//    messages, so every detail goes through scrub() before it is returned.

export type Probe={name:string;ok:boolean;ms:number;detail?:string};
export type Health={ok:boolean;at:string;checks:Probe[]};

/** Anything that looks like a credential, plus the exact values we hold. */
export function scrub(text:string):string{
 let out=text;
 for(const name of ['SUPABASE_SERVICE_ROLE_KEY','SUPABASE_URL','TELEGRAM_BOT_TOKEN',
                    'TELEGRAM_WEBHOOK_SECRET','VEYRO_CREDENTIALS_KEY','HELIUS_API_KEY',
                    'SOLANA_MAINNET_RPC_URL','SOLANA_MAINNET_READ_RPC_URL']){
  const v=process.env[name];
  if(v&&v.length>7)out=out.split(v).join('[redacted]');
 }
 return out
  .replace(/sb_secret_[A-Za-z0-9_-]+/g,'[redacted]')
  .replace(/\b\d{6,}:[A-Za-z0-9_-]{30,}\b/g,'[redacted]')   // telegram bot token
  .replace(/\b(api[-_]?key|apikey|token)=[^&\s]+/gi,'$1=[redacted]')
  .replace(/\b[A-Fa-f0-9]{48,}\b/g,'[redacted]');
}

const timeout=(ms:number)=>new Promise<never>((_,reject)=>
 setTimeout(()=>reject(Error('TIMEOUT after '+ms+'ms')),ms).unref?.());

/**
 * Runs every probe concurrently. A probe resolves with a short human detail
 * or throws; either way it produces one entry and never rejects.
 */
export async function probe(
 probes:Record<string,()=>Promise<string|void>>,
 opts:{timeoutMs?:number}={},
):Promise<Health>{
 const ms=opts.timeoutMs??4000;
 const checks=await Promise.all(Object.entries(probes).map(async([name,run]):Promise<Probe>=>{
  const started=Date.now();
  try{
   const detail=await Promise.race([run(),timeout(ms)]);
   return {name,ok:true,ms:Date.now()-started,...(detail?{detail:scrub(String(detail))}:{})};
  }catch(e){
   return {name,ok:false,ms:Date.now()-started,detail:scrub((e as Error).message||'failed')};
  }
 }));
 return {ok:checks.every(c=>c.ok),at:new Date().toISOString(),checks};
}
