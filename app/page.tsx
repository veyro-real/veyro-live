'use client';

import {useEffect,useRef,useState,type FormEvent} from 'react';

type Policy={active:boolean;maxAmount:string;totalLimit:string;spent:string;expiresAt:number;address:string};
type Candidate={name:string;symbol:string;mint:string|null;score:number;sourceUrl:string|null;reason:string};
type Attempt={id:string;at:string;kind:string;decision:'ALLOW'|'DENY'|null;reason:string;status:string;executedSignature?:string;candidateSignature?:string;selected?:Candidate;research?:{source:string;candidates:Candidate[]}};
type State={mode:string;network:string;xConfigured:boolean;cloudAudit?:boolean;policy:Policy|null;attempts:Attempt[];error?:string};
type PhantomProvider={publicKey?:{toString():string};connect():Promise<{publicKey:{toString():string}}>};

const PROGRAM_ID='2Z7xH99Z4YvG4U2Ew5PUZtVh8FE1VRhQ1Mo9dFvRvS3Q';
const DEPLOY_TX='5vAZwzkAap1dGa9Sq2JJdnfBrKPXKjkSBWsqdAwjkrZtcS7oUooqYh7QpGC1V9hfdtmJPW7r6fFDjsFW8tnn4mKZ';
const initial:State={mode:'rehearsal',network:'Connecting',xConfigured:false,policy:null,attempts:[]};
const short=(value:string)=>value.length>16?value.slice(0,5)+'...'+value.slice(-5):value;
const dollars=(value:string)=>Number(BigInt(value||'0'))/1e6;
const words=(value:string)=>value.replaceAll('_',' ').toLowerCase();

function Mesh(){
 const ref=useRef<HTMLCanvasElement>(null);
 useEffect(()=>{
  let frame=0,raf=0;
  const canvas=ref.current,ctx=canvas?.getContext('2d');
  if(!canvas||!ctx)return;
  const draw=()=>{
   const ratio=window.devicePixelRatio||1,w=canvas.clientWidth*ratio,h=canvas.clientHeight*ratio;
   if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
   ctx.clearRect(0,0,w,h);
   ctx.strokeStyle='rgba(255,255,255,.08)';ctx.lineWidth=1*ratio;
   for(let i=0;i<7;i++){
    ctx.beginPath();
    const y=h*(.18+i*.12)+Math.sin(frame*.01+i)*14*ratio;
    ctx.moveTo(0,y);
    for(let x=0;x<=w;x+=80*ratio)ctx.lineTo(x,y+Math.sin(x*.006+frame*.012+i)*18*ratio);
    ctx.stroke();
   }
   frame++;raf=requestAnimationFrame(draw);
  };
  draw();
  return()=>cancelAnimationFrame(raf);
 },[]);
 return <canvas className="mesh" ref={ref} aria-hidden="true"/>;
}

export default function Live(){
 const [data,setData]=useState<State>(initial);
 const [intent,setIntent]=useState('Find the dumbest meme coin on crypto X. Spend up to $1.');
 const [budget,setBudget]=useState('1');
 const [token,setToken]=useState('');
 const [session,setSession]=useState('');
 const [wallet,setWallet]=useState('');
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');

 useEffect(()=>{let id=localStorage.getItem('veyro-session');if(!id){id=crypto.randomUUID();localStorage.setItem('veyro-session',id);}setSession(id);},[]);
 useEffect(()=>{if(session)void refresh();},[session]);

 function headers(){return {'Content-Type':'application/json','x-veyro-session':session,...(token?{Authorization:'Bearer '+token}:{})};}
 async function refresh(){try{const res=await fetch('/api/state',{headers:headers(),cache:'no-store'});const value=await res.json();setData(value);if(value.error)setMessage(value.error);}catch{setMessage('Could not reach Veyro.');}}
 async function action(kind:string,extra:Record<string,unknown>={}){
  const res=await fetch('/api/action',{method:'POST',headers:headers(),body:JSON.stringify({action:kind,requestId:crypto.randomUUID(),intent,budget,total:budget,hours:'1',liveResearch:data.xConfigured,scenario:'approved',...extra})});
  const value=await res.json();
  if(value.error)throw Error(value.error);
  setData(value);
  return value;
 }
 async function run(event?:FormEvent){
  event?.preventDefault();
  if(busy)return;
  setBusy(true);setMessage('');
  try{
   if(!data.policy?.active)await action('configure');
   const value=await action('run');
   setMessage(value.attempt?.reason||'Complete');
  }catch(error){setMessage((error as Error).message);}finally{setBusy(false);}
 }
 async function connectWallet(){
  const provider=((window as typeof window&{phantom?:{solana?:PhantomProvider};solana?:PhantomProvider}).phantom?.solana||(window as typeof window&{solana?:PhantomProvider}).solana);
  if(!provider){const page=encodeURIComponent(window.location.href),ref=encodeURIComponent(window.location.origin);window.location.href=`https://phantom.app/ul/browse/${page}?ref=${ref}`;return;}
  try{setWallet((await provider.connect()).publicKey.toString());}catch(error){setMessage((error as Error).message||'Wallet connection cancelled');}
 }

 const latest=data.attempts.find(a=>a.kind==='run'||a.kind==='research');
 const candidate=latest?.selected||latest?.research?.candidates?.[0];
 const signature=latest?.executedSignature||latest?.candidateSignature;
 const remaining=data.policy?Math.max(0,dollars(data.policy.totalLimit)-dollars(data.policy.spent)):Number(budget||0);

 return <>
  <Mesh/>
  <header className="topbar">
   <a className="brand" href="/"><span>V</span><b>veyro</b></a>
   <nav><a href="/admin">Admin</a><a href="https://github.com/veyro-real/veyro-protocol" target="_blank" rel="noreferrer">Protocol</a><button onClick={()=>void connectWallet()}>{wallet?short(wallet):'Connect wallet'}</button></nav>
  </header>
  <main className="single">
   <section className="command-card">
    <div className="card-head">
     <div><span className="eyebrow">LIVE DEMO</span><h1>Ask the agent. Veyro checks the spend.</h1></div>
     <span className="pill"><i/>Mainnet deployed</span>
    </div>
    <form onSubmit={event=>void run(event)}>
     <label className="prompt-label">What do you want?</label>
     <textarea value={intent} onChange={event=>setIntent(event.target.value)} aria-label="Agent instruction" maxLength={500}/>
     <div className="limit-line">
      <label><span>Spend limit</span><div><b>$</b><input value={budget} onChange={event=>setBudget(event.target.value)} inputMode="decimal"/><small>USDC</small></div></label>
      <button className="run" disabled={busy}>{busy?'Running...':'Run agent'}</button>
     </div>
    </form>
    <div className="decision-panel">
     <div className={'decision '+(latest?.decision||'pending').toLowerCase()}>
      <span>{latest?.decision||'READY'}</span>
      <strong>{latest?words(latest.reason):'Waiting for your prompt'}</strong>
      <small>{busy?'checking policy before execution':latest?.status?.toLowerCase()||`${remaining.toFixed(2)} USDC available`}</small>
     </div>
     {candidate&&<div className="candidate"><div className="coin">{candidate.symbol.slice(0,1)}</div><div><span>Candidate</span><strong>{candidate.name} / ${candidate.symbol}</strong>{candidate.mint&&<code>{short(candidate.mint)}</code>}</div>{candidate.sourceUrl&&<a href={candidate.sourceUrl} target="_blank" rel="noreferrer">Source</a>}</div>}
     {signature&&<div className="receipt"><span>Receipt</span><a href={`https://solscan.io/tx/${signature}?cluster=${data.mode==='testnet'?'testnet':''}`} target="_blank" rel="noreferrer">Solscan</a><a href={`https://explorer.solana.com/tx/${signature}${data.mode==='testnet'?'?cluster=testnet':''}`} target="_blank" rel="noreferrer">Explorer</a></div>}
     {message&&<p className="message">{words(message)}</p>}
    </div>
   </section>
   <section className="below">
    <div><span>Program</span><a href={`https://solscan.io/account/${PROGRAM_ID}`} target="_blank" rel="noreferrer">{short(PROGRAM_ID)}</a></div>
    <div><span>Network</span><b>Solana mainnet</b></div>
    <div><span>Deploy tx</span><a href={`https://solscan.io/tx/${DEPLOY_TX}`} target="_blank" rel="noreferrer">{short(DEPLOY_TX)}</a></div>
   </section>
   <details className="operator"><summary>Operator token</summary><input type="password" value={token} onChange={event=>setToken(event.target.value)} placeholder="Paste operator token for live X or owner actions"/><button onClick={()=>void refresh()}>Apply</button></details>
  </main>
 </>;
}
