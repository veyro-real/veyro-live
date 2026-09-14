'use client';

import {useEffect,useState,type FormEvent} from 'react';

type Policy={active:boolean;maxAmount:string;totalLimit:string;spent:string;expiresAt:number;address:string;agent:string;allowedRecipients:string[];allowedPrograms:string[]};
type Candidate={name:string;symbol:string;mint:string|null;score:number;sourceUrl:string|null;reason:string};
type Attempt={id:string;at:string;kind:string;agent:string|null;policy?:{address?:string};decision:'ALLOW'|'DENY'|null;reason:string;status:string;executedSignature?:string;candidateSignature?:string;selected?:Candidate;research?:{source:string;candidates:Candidate[]};request?:Record<string,unknown>};
type State={mode:string;network:string;xConfigured:boolean;configured:boolean;cloudAudit?:boolean;policy:Policy|null;attempts:Attempt[];error?:string};
type PhantomProvider={publicKey?:{toString():string};connect():Promise<{publicKey:{toString():string}}>};

const PROGRAM_ID='2Z7xH99Z4YvG4U2Ew5PUZtVh8FE1VRhQ1Mo9dFvRvS3Q';
const initial:State={mode:'rehearsal',network:'Connecting',xConfigured:false,configured:false,policy:null,attempts:[]};
const dollars=(value:string)=>new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(Number(BigInt(value||'0'))/1e6);
const short=(value:string)=>value.length>18?value.slice(0,6)+'…'+value.slice(-5):value;
const words=(value:string)=>value.replaceAll('_',' ').toLowerCase();

export default function Live(){
 const [data,setData]=useState<State>(initial);
 const [intent,setIntent]=useState('Find the dumbest meme coin. Here’s $100. Make me money.');
 const [budget,setBudget]=useState('100');
 const [total,setTotal]=useState('150');
 const [hours,setHours]=useState('1');
 const [allowedRecipients,setAllowedRecipients]=useState('');
 const [allowedPrograms,setAllowedPrograms]=useState('');
 const [liveResearch,setLiveResearch]=useState(false);
 const [scenario,setScenario]=useState('approved');
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 const [token,setToken]=useState('');
 const [session,setSession]=useState('');
 const [requestId,setRequestId]=useState('');
 const [showAccess,setShowAccess]=useState(false);
 const [wallet,setWallet]=useState('');
 const [walletBusy,setWalletBusy]=useState(false);

 useEffect(()=>{let id=localStorage.getItem('veyro-session');if(!id){id=crypto.randomUUID();localStorage.setItem('veyro-session',id);}setSession(id);setRequestId(crypto.randomUUID());},[]);
 useEffect(()=>{if(session)void refresh();},[session]);

 function headers(){return {'Content-Type':'application/json','x-veyro-session':session,...(token?{Authorization:'Bearer '+token}:{})};}
 async function refresh(){try{const response=await fetch('/api/state',{headers:headers(),cache:'no-store'});const value=await response.json();setData(value);if(value.error)setMessage(value.error);}catch{setMessage('Could not reach Veyro.');}}
 async function action(kind:string){
  if(busy)return;
  setBusy(true);setMessage('');
  try{
   const id=kind==='run'?requestId:crypto.randomUUID();
   const response=await fetch('/api/action',{method:'POST',headers:headers(),body:JSON.stringify({action:kind,requestId:id,intent,budget,total,hours,allowedRecipients,allowedPrograms,liveResearch,scenario})});
   const value=await response.json();
   if(value.error)throw Error(value.error);
   setData(value);setMessage(value.attempt?.reason||'Updated');
   if(kind==='run')setRequestId(crypto.randomUUID());
  }catch(error){setMessage((error as Error).message);}finally{setBusy(false);}
 }
 async function connectWallet(){
  const provider=((window as typeof window&{phantom?:{solana?:PhantomProvider};solana?:PhantomProvider}).phantom?.solana||(window as typeof window&{solana?:PhantomProvider}).solana);
  if(!provider){
   const page=encodeURIComponent(window.location.href),ref=encodeURIComponent(window.location.origin);
   window.location.href=`https://phantom.app/ul/browse/${page}?ref=${ref}`;
   return;
  }
  setWalletBusy(true);setMessage('');
  try{const connected=await provider.connect();setWallet(connected.publicKey.toString());setMessage('Wallet connected');}catch(error){setMessage((error as Error).message||'Wallet connection cancelled');}finally{setWalletBusy(false);}
 }

 const policy=data.policy;
 const remaining=policy?BigInt(policy.totalLimit)-BigInt(policy.spent):0n;
 const latest=data.attempts.find(attempt=>attempt.kind==='run'||attempt.kind==='research');
 const signature=latest?.executedSignature||latest?.candidateSignature;
 const topCandidate=latest?.selected||latest?.research?.candidates?.[0];

 return <>
  <header className="topbar">
   <a className="brand" href="/" aria-label="Veyro home"><span>V</span><b>veyro</b></a>
   <div className="header-links">
    <span className="network"><i/>{data.network}</span>
    <a href="https://github.com/veyro-real/veyro-protocol" target="_blank" rel="noreferrer">Protocol ↗</a>
    <button className="wallet-button" disabled={walletBusy} onClick={()=>void connectWallet()}>{wallet?short(wallet):walletBusy?'Connecting…':'Connect wallet'}</button>
   </div>
  </header>

  <main>
   <section className="hero">
    <span className="eyebrow">VEYRO LIVE</span>
    <h1>Give the agent a goal.<br/>Keep control of the money.</h1>
    <p>Three steps. Every purchase is checked before funds move.</p>
   </section>

   {message&&<div className="feedback" role="status"><span>{words(message)}</span><button onClick={()=>setMessage('')} aria-label="Dismiss">×</button></div>}

   <section className="step-card">
    <div className="step-number">1</div>
    <div className="step-body">
     <div className="step-title"><div><h2>Set the limit</h2><p>You decide how much the agent can spend.</p></div>{policy&&<span className={'status '+(policy.active?'allow':'deny')}><i/>{policy.active?'Active':'Revoked'}</span>}</div>
     <div className="limit-row">
      <label><span>Per purchase</span><div className="money"><b>$</b><input value={budget} onChange={event=>setBudget(event.target.value)} inputMode="decimal"/><small>USDC</small></div></label>
      <label><span>Total allowance</span><div className="money"><b>$</b><input value={total} onChange={event=>setTotal(event.target.value)} inputMode="decimal"/><small>USDC</small></div></label>
      <label><span>Expires in</span><div className="money"><input value={hours} onChange={event=>setHours(event.target.value)} type="number" min="0.05" max="24" step="0.05"/><small>HOURS</small></div></label>
     </div>
     <div className="action-row"><button className="primary" disabled={busy} onClick={()=>void action('configure')}>{busy?'Saving…':'Save limits'}</button>{policy&&<span className="summary">${dollars(remaining.toString())} remaining</span>}</div>
     <details><summary>Advanced policy controls</summary><div className="advanced-grid"><label>Allowed recipient wallets<input value={allowedRecipients} onChange={event=>setAllowedRecipients(event.target.value)} placeholder={policy?.allowedRecipients.join(', ')||'Safe demo default'}/></label><label>Allowed Solana programs<input value={allowedPrograms} onChange={event=>setAllowedPrograms(event.target.value)} placeholder={policy?.allowedPrograms.join(', ')||'SPL Token program'}/></label></div><div className="detail-actions"><button className="danger" disabled={busy||!policy?.active} onClick={()=>void action('revoke')}>Revoke agent</button><button className="secondary" onClick={()=>setShowAccess(true)}>Operator access</button><button className="secondary" disabled={busy||data.mode!=='testnet'} onClick={()=>void action('faucet')}>Request test SOL</button></div></details>
    </div>
   </section>

   <section className="step-card">
    <div className="step-number">2</div>
    <div className="step-body">
     <div className="step-title"><div><h2>Tell the agent what to do</h2><p>Use the same plain-language request you would make from your phone.</p></div></div>
     <form onSubmit={(event:FormEvent)=>{event.preventDefault();void action('run');}}>
      <textarea aria-label="Agent instruction" value={intent} onChange={event=>setIntent(event.target.value)} maxLength={2000}/>
      <div className="run-row">
       <label className="toggle"><input type="checkbox" checked={liveResearch} disabled={!data.xConfigured} onChange={event=>setLiveResearch(event.target.checked)}/><span>Search crypto X</span><small>{data.xConfigured?'connected':'not connected'}</small></label>
       <button className="primary run" disabled={busy||!policy} type="submit">{busy?'Working…':'Run agent'} <span>→</span></button>
      </div>
     </form>
     <details><summary>Demo a blocked request</summary><select value={scenario} onChange={event=>setScenario(event.target.value)}><option value="approved">Approved purchase</option><option value="over-limit">Over the purchase limit</option><option value="cumulative">Over the total allowance</option><option value="unauthorized">Unapproved recipient</option><option value="compromised">Compromised agent</option></select></details>
    </div>
   </section>

   <section className="step-card result-card">
    <div className="step-number">3</div>
    <div className="step-body">
     <div className="step-title"><div><h2>See the decision</h2><p>Veyro checks the policy before execution.</p></div><button className="text-button" disabled={busy} onClick={()=>void action('reconcile')}>Refresh</button></div>
     {latest?<div className="result">
      <div className={'decision '+(latest.decision||'').toLowerCase()}><span>{latest.decision||'PENDING'}</span><strong>{words(latest.reason)}</strong><small>{latest.status.toLowerCase()}</small></div>
      <div className="flow"><span className="done">Intent</span><i>→</i><span className="done">Research</span><i>→</i><span className={latest.decision?'done':''}>Policy check</span><i>→</i><span className={latest.executedSignature?'done':''}>Settlement</span></div>
      {topCandidate&&<div className="candidate"><div className="coin">{topCandidate.symbol.slice(0,1)}</div><div><span>Selected candidate</span><strong>{topCandidate.name} · ${topCandidate.symbol}</strong>{topCandidate.mint&&<code>{short(topCandidate.mint)}</code>}</div>{topCandidate.sourceUrl&&<a href={topCandidate.sourceUrl} target="_blank" rel="noreferrer">Source ↗</a>}</div>}
      {signature&&<div className="receipts"><span>Transaction receipt</span><a href={'https://solscan.io/tx/'+signature+'?cluster=testnet'} target="_blank" rel="noreferrer">Solscan ↗</a><a href={'https://explorer.solana.com/tx/'+signature+'?cluster=testnet'} target="_blank" rel="noreferrer">Explorer ↗</a></div>}
     </div>:<div className="empty-result"><span>Waiting for your first run.</span><p>The policy decision and transaction receipt will appear here.</p></div>}
    </div>
   </section>

   <details className="audit">
    <summary>View full audit trail <span>{data.attempts.length}</span></summary>
    <div className="table-scroll"><table><thead><tr><th>Request</th><th>Decision</th><th>Reason</th><th>Time</th><th>Receipt</th></tr></thead><tbody>{data.attempts.map(attempt=><tr key={attempt.id}><td>{attempt.kind}</td><td><span className={'status '+(attempt.decision||'').toLowerCase()}>{attempt.decision||'—'}</span></td><td>{words(attempt.reason)}</td><td>{new Date(attempt.at).toLocaleString()}</td><td>{attempt.executedSignature?<a href={'https://solscan.io/tx/'+attempt.executedSignature+'?cluster=testnet'} target="_blank" rel="noreferrer">Solscan ↗</a>:'—'}</td></tr>)}</tbody></table></div>
   </details>

   <section className="chain-bar"><div><span>Protocol address</span><code>{short(PROGRAM_ID)}</code></div><div><a href={'https://solscan.io/account/'+PROGRAM_ID+'?cluster=testnet'} target="_blank" rel="noreferrer">Solscan ↗</a><a href={'https://explorer.solana.com/address/'+PROGRAM_ID+'?cluster=testnet'} target="_blank" rel="noreferrer">Explorer ↗</a></div></section>

   <footer><span>Veyro · early developer preview</span><span>{data.cloudAudit?'Supabase connected':'Storage unavailable'}</span></footer>
  </main>

  {showAccess&&<div className="overlay" role="dialog" aria-modal="true" aria-label="Connect to Veyro"><section className="access-card"><button className="close" onClick={()=>setShowAccess(false)} aria-label="Close">×</button><span className="eyebrow">ACCESS</span><h2>Connect to Veyro</h2><p>Enter the operator token stored in Railway. It stays in this browser tab.</p><label>Operator token<input type="password" autoComplete="off" value={token} onChange={event=>setToken(event.target.value)} placeholder="Paste operator token"/></label><button className="primary wide" onClick={async()=>{await refresh();setShowAccess(false);}}>Connect</button><p className="security-note">Never enter a wallet seed phrase here.</p></section></div>}
 </>;
}
