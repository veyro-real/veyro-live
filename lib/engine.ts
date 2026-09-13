import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {parseIntent,pickCandidate,previewPolicy} from '@veyro/core';
import {Rpc,keyFromSecret,generateKey,exportKey,decodePolicy,swapIx,revokeIx,evaluateTransaction,createPolicyIx,policyAddress,systemCreate,initializeToken,mintTo,TOKEN} from '@veyro/sdk';
import {beginAttempt,recordAttempt,attempts,getState,saveState,claimRequest,finishRequest,type Attempt} from './store';
import {mode} from './auth';
import {research} from './research';
export type DemoPolicy={active:boolean;expiresAt:number;maxAmount:string;totalLimit:string;spent:string;allowedRecipients:string[];allowedPrograms:string[];nonce:string;address:string;agent:string};
const defaultPolicy=():DemoPolicy=>({active:true,expiresAt:Math.floor(Date.now()/1000)+3600,maxAmount:'100000000',totalLimit:'150000000',spent:'0',allowedRecipients:['demo-owner'],allowedPrograms:[TOKEN],nonce:'0',address:'rehearsal-policy',agent:'rehearsal-agent'});
const serial=(p:unknown)=>JSON.parse(JSON.stringify(p,(_k,v)=>typeof v==='bigint'?v.toString():v));
let queue:Promise<unknown>=Promise.resolve();
export function exclusive<T>(fn:()=>Promise<T>):Promise<T>{const next=queue.then(fn,fn);queue=next.catch(()=>{});return next;}
export function deployment(){const saved=getState<any>('runtime');if(saved)return saved;const file=process.env.VEYRO_DEPLOYMENT_FILE;if(!file)throw Error('TESTNET_NOT_CONFIGURED');return JSON.parse(readFileSync(file,'utf8'));}
const key=(name:string)=>keyFromSecret(Uint8Array.from(JSON.parse(readFileSync(resolve(process.env.VEYRO_KEYS_DIR||'keys',name+'.json'),'utf8'))));
function rpcFor(c:any){return new Rpc(process.env.SOLANA_RPC_URL||c.rpcUrl);}
function list(value:unknown,fallback:string[],max:number){const values=typeof value==='string'?value.split(/[\s,]+/).filter(Boolean):Array.isArray(value)?value.map(String):fallback;if(values.length>max||new Set(values).size!==values.length)throw Error('INVALID_POLICY_ALLOWLIST');return values;}
export async function currentPolicy(session:string):Promise<DemoPolicy>{if(mode()==='rehearsal'){let p=getState<DemoPolicy>('policy:'+session);if(!p){p=defaultPolicy();saveState('policy:'+session,p);}return p;}const c=deployment(),rpc=rpcFor(c);await rpc.assertTestCluster();const a=await rpc.account(c.policy);if(!a||a.owner!==c.programId)throw Error('POLICY_NOT_FOUND');const p=decodePolicy(a.data);return {...serial(p),expiresAt:Number(p.expiresAt),address:c.policy};}
export async function state(session?:string){const base={mode:mode(),network:mode()==='testnet'?'Solana testnet':'Local rehearsal',xConfigured:!!process.env.X_BEARER_TOKEN,configured:mode()==='rehearsal'||!!process.env.VEYRO_DEPLOYMENT_FILE,mainnetEnabled:false,quoteLabel:'TEST-USD',outputLabel:'TEST-MEME'};if(!session)return {...base,policy:null,attempts:[]};try{return {...base,policy:await currentPolicy(session),attempts:attempts(session)};}catch(e){return {...base,policy:null,attempts:attempts(session),error:(e as Error).message};}}
export async function reconcile(session:string){if(mode()!=='testnet')return;const c=deployment(),rpc=rpcFor(c);await rpc.assertTestCluster();for(const a of attempts(session,true)){if(!a.candidateSignature||!['SIGNED','SUBMITTED','UNKNOWN','CONFIRMED'].includes(a.status))continue;const status=(await rpc.call('getSignatureStatuses',[[a.candidateSignature],{searchTransactionHistory:true}])).value[0];if(status?.err){a.status='FAILED';a.reason=JSON.stringify(status.err);}else if(status?.confirmationStatus==='finalized'){a.status='FINALIZED';a.executedSignature=a.candidateSignature;if(a.pendingRuntime)saveState('runtime',a.pendingRuntime);}else if(status){a.status='CONFIRMED';}else if(a.lastValidBlockHeight && await rpc.call<number>('getBlockHeight',[{commitment:'finalized'}])>a.lastValidBlockHeight){a.status='EXPIRED';a.reason='BLOCKHASH_EXPIRED_WITHOUT_OBSERVED_SETTLEMENT';}else a.status='UNKNOWN';recordAttempt(session,a);}}
export async function act(session:string,body:any,operator:boolean):Promise<unknown>{return exclusive(async()=>{
 const kind=String(body?.action||'');const idempotency=String(body?.requestId||'');if(!/^[a-f0-9-]{36}$/.test(idempotency))throw Error('REQUEST_ID_REQUIRED');
 const existing=claimRequest(session,idempotency);if(existing){if(existing==='IN_PROGRESS')throw Error('REQUEST_IN_PROGRESS_OR_RECOVERY_REQUIRED');return {attempt:attempts(session).find(a=>a.id===existing),...await state(session)};}
 const a=beginAttempt(session,kind,{intent:body.intent,budget:body.budget,scenario:body.scenario,liveResearch:body.liveResearch===true});finishRequest(session,idempotency,a.id);
 try{
  if(mode()==='testnet'&&['configure','revoke','faucet'].includes(kind)&&!operator)throw Error('OWNER_ACTION_REQUIRED');
  if(kind==='reconcile'){await reconcile(session);a.decision='ALLOW';a.reason='RECONCILED';a.status='COMPLETE';recordAttempt(session,a);return {attempt:publicAttempt(a),...await state(session)};}
  if(kind==='faucet'){if(mode()==='rehearsal')throw Error('FAUCET_REQUIRES_TESTNET');const c=deployment(),rpc=rpcFor(c);await rpc.assertTestCluster();const rateKey='faucet:last';if(Date.now()-(getState<number>(rateKey)||0)<60000)throw Error('FAUCET_COOLDOWN');saveState(rateKey,Date.now());a.candidateSignature=await rpc.call<string>('requestAirdrop',[c.executor,500_000_000]);a.decision='ALLOW';a.status='SUBMITTED';a.reason='FAUCET_REQUESTED';recordAttempt(session,a);return {attempt:publicAttempt(a),...await state(session)};}
  if(kind==='configure'){
   const intent=parseIntent('Set owner spending limits',String(body.budget));const total=parseIntent('Set lifetime budget',String(body.total||body.budget));if(BigInt(total.budgetMicros)<BigInt(intent.budgetMicros))throw Error('TOTAL_BELOW_TRANSACTION_LIMIT');
   const hours=Number(body.hours||1);if(!Number.isFinite(hours)||hours<0.05||hours>24)throw Error('INVALID_EXPIRATION');
   const c=mode()==='testnet'?deployment():null;const allowedRecipients=list(body.allowedRecipients,c?[c.owner]:['demo-owner'],8);const allowedPrograms=list(body.allowedPrograms,[TOKEN],4);
   if(mode()==='rehearsal'){const p={...defaultPolicy(),maxAmount:intent.budgetMicros,totalLimit:total.budgetMicros,allowedRecipients,allowedPrograms,expiresAt:Math.floor(Date.now()/1000+hours*3600),address:'rehearsal-'+randomUUID()};saveState('policy:'+session,p);a.agent=p.agent;a.policy=p;a.decision='ALLOW';a.reason='REHEARSAL_POLICY_CREATED';a.status='REHEARSED';}
   else {
    const rpc=rpcFor(c);await rpc.assertTestCluster();const current=await currentPolicy(session);if(current.active)throw Error('REVOKE_CURRENT_POLICY_FIRST');
    const owner=key('owner'),admin=key('admin'),agent=generateKey(),vault=generateKey(),name='agent-'+randomUUID();
    mkdirSync(process.env.VEYRO_KEYS_DIR||'keys',{recursive:true,mode:0o700});writeFileSync(resolve(process.env.VEYRO_KEYS_DIR||'keys',name+'.json'),JSON.stringify(exportKey(agent)),{mode:0o600});
    const policy=policyAddress(owner.publicKey,agent.publicKey,c.programId);const rent=await rpc.call<number>('getMinimumBalanceForRentExemption',[165]);
    const tx=await rpc.transaction(owner,[admin,vault],[createPolicyIx({owner:owner.publicKey,agent:agent.publicKey,executor:c.executor,allowedRecipients,allowedPrograms,pool:c.pool,maxAmount:BigInt(intent.budgetMicros),totalLimit:BigInt(total.budgetMicros),expiresAt:BigInt(Math.floor(Date.now()/1000+hours*3600)),minRate:990n},c.programId),systemCreate(owner.publicKey,vault.publicKey,BigInt(rent),165n,TOKEN),initializeToken(vault.publicKey,c.quoteMint,policy),mintTo(c.quoteMint,vault.publicKey,admin.publicKey,BigInt(total.budgetMicros))]);
    a.agent=agent.publicKey;a.policy={address:policy,owner:owner.publicKey,agent:agent.publicKey,allowedRecipients,allowedPrograms,maxAmount:intent.budgetMicros,totalLimit:total.budgetMicros,expiresAt:Math.floor(Date.now()/1000+hours*3600)};a.decision='ALLOW';a.candidateSignature=tx.signature;a.wire=Buffer.from(tx.bytes).toString('base64');a.lastValidBlockHeight=tx.lastValidBlockHeight;a.status='SIGNED';a.pendingRuntime={...c,policy,agent:agent.publicKey,agentKey:name,vault:vault.publicKey};recordAttempt(session,a);await rpc.send(tx.bytes);await rpc.confirm(tx.signature);saveState('runtime',a.pendingRuntime);a.executedSignature=tx.signature;a.status='FINALIZED';a.reason='POLICY_CREATED';
   }
  }else if(kind==='revoke'){
   const p=await currentPolicy(session);a.policy=p;a.agent=p.agent;
   if(mode()==='rehearsal'){saveState('policy:'+session,{...p,active:false});a.decision='ALLOW';a.status='REHEARSED';a.reason='REVOKED';}
   else{const c=deployment(),rpc=rpcFor(c),owner=key('owner');const tx=await rpc.transaction(owner,[],[revokeIx(owner.publicKey,c.policy,c.programId)]);a.decision='ALLOW';a.candidateSignature=tx.signature;a.wire=Buffer.from(tx.bytes).toString('base64');a.lastValidBlockHeight=tx.lastValidBlockHeight;a.status='SIGNED';recordAttempt(session,a);await rpc.send(tx.bytes);await rpc.confirm(tx.signature);a.executedSignature=tx.signature;a.status='FINALIZED';a.reason='REVOKED';}
  }else if(kind==='run'||kind==='research'){
   const intent=parseIntent(String(body.intent||''),String(body.budget||''));a.request={...a.request as object,intent};recordAttempt(session,a);
   if(body.liveResearch===true && mode()==='rehearsal' && !operator)throw Error('OPERATOR_REQUIRED_FOR_PAID_RESEARCH');
   const findings=await research(body.liveResearch===true);a.research=findings;const selected=pickCandidate(findings.candidates);a.selected=selected;a.testTokenMapping={researchMint:selected.mint,executedToken:'TEST-MEME',sameAsset:false};recordAttempt(session,a);
   if(kind==='research'){a.decision='ALLOW';a.reason='RESEARCH_COMPLETE';a.status='COMPLETE';recordAttempt(session,a);return {attempt:publicAttempt(a),...await state(session)};}
   const p=await currentPolicy(session);a.policy=p;a.agent=p.agent;let amount=BigInt(intent.budgetMicros);const scenario=String(body.scenario||'approved');if(scenario==='over-limit')amount=BigInt(p.maxAmount)+1n;if(scenario==='cumulative')amount=BigInt(p.totalLimit)-BigInt(p.spent)+1n;
   const deniedRecipient=['unauthorized','compromised'].includes(scenario);const recipient=deniedRecipient?'attacker':p.allowedRecipients[0];a.request={...a.request as object,amount:amount.toString(),recipient,program:TOKEN};
   if(mode()==='rehearsal'){const reason=previewPolicy(p,{amount:amount.toString(),recipient,program:TOKEN});a.reason=reason;a.decision=reason==='POLICY_SATISFIED'?'ALLOW':'DENY';a.status='REHEARSED';if(a.decision==='ALLOW')saveState('policy:'+session,{...p,spent:(BigInt(p.spent)+amount).toString(),nonce:(BigInt(p.nonce)+1n).toString()});}
   else{
    await reconcile(session);if(attempts(session,true).some(x=>x.id!==a.id && ['SIGNED','SUBMITTED','UNKNOWN','CONFIRMED'].includes(x.status)))throw Error('PREVIOUS_TRANSACTION_UNRESOLVED');
    const c=deployment(),rpc=rpcFor(c),agent=key(c.agentKey||'agent'),executor=key('executor');if(!deniedRecipient&&recipient!==c.owner)throw Error('RECIPIENT_ACCOUNT_UNAVAILABLE');const recipientTokenAccount=deniedRecipient?c.attacker:c.recipient;a.request={...a.request as object,recipientTokenAccount};const tx=await rpc.transaction(executor,[agent],[swapIx({...c,recipient:recipientTokenAccount},amount,amount*990n,BigInt(p.nonce),c.programId)]);
    const verdict=await evaluateTransaction(rpc,tx.bytes);a.simulationSlot=verdict.simulationSlot;a.reason=verdict.reason;a.decision=verdict.decision;a.status=verdict.decision==='DENY'?'DENIED':'EVALUATED';recordAttempt(session,a);
    if(a.decision==='ALLOW'){a.candidateSignature=tx.signature;a.wire=Buffer.from(tx.bytes).toString('base64');a.lastValidBlockHeight=tx.lastValidBlockHeight;a.status='SIGNED';recordAttempt(session,a);await rpc.send(tx.bytes);a.status='SUBMITTED';recordAttempt(session,a);await rpc.confirm(tx.signature);a.executedSignature=tx.signature;a.status='FINALIZED';}
   }
  }else throw Error('UNSUPPORTED_ACTION');
 }catch(e){a.reason=(e as Error).message;a.status=a.candidateSignature?'UNKNOWN':'FAILED';if(!a.decision)a.decision='DENY';}
 recordAttempt(session,a);return {attempt:publicAttempt(a),...await state(session)};
 });}
function publicAttempt(a:Attempt){const {wire,pendingRuntime,...publicFields}=a;return publicFields;}
