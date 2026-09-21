'use client';

import {useState,type FormEvent} from 'react';

type Status={xBearerToken:boolean;jupiterApiKey:boolean;mainnetRpcUrl:boolean};
const empty:Status={xBearerToken:false,jupiterApiKey:false,mainnetRpcUrl:false};

export default function Admin(){
 const [operator,setOperator]=useState('');
 const [xBearerToken,setXBearerToken]=useState('');
 const [jupiterApiKey,setJupiterApiKey]=useState('');
 const [mainnetRpcUrl,setMainnetRpcUrl]=useState('');
 const [status,setStatus]=useState<Status>(empty);
 const [message,setMessage]=useState('');
 const [busy,setBusy]=useState(false);

 async function load(){
  const res=await fetch('/api/admin/credentials',{headers:{Authorization:'Bearer '+operator},cache:'no-store'});
  const value=await res.json();
  if(value.error)throw Error(value.error);
  setStatus(value.credentials);
 }
 async function save(event:FormEvent){
  event.preventDefault();
  if(busy)return;
  setBusy(true);setMessage('');
  try{
   const res=await fetch('/api/admin/credentials',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+operator},body:JSON.stringify({credentials:{xBearerToken,jupiterApiKey,mainnetRpcUrl}})});
   const value=await res.json();
   if(value.error)throw Error(value.error);
   setStatus(value.credentials);
   setXBearerToken('');setJupiterApiKey('');setMainnetRpcUrl('');
   setMessage('Saved encrypted credentials');
  }catch(error){setMessage((error as Error).message);}finally{setBusy(false);}
 }

 return <main className="admin-main">
  <section className="admin-card">
   <span className="eyebrow">ADMIN</span>
   <h1>Connect the services.</h1>
   <p>Paste credentials once. Veyro encrypts them on the server before writing to Supabase.</p>
   <form onSubmit={event=>void save(event)}>
    <label><span>Operator token</span><input type="password" value={operator} onChange={event=>setOperator(event.target.value)} autoComplete="off" placeholder="Required"/></label>
    <label><span>X bearer token</span><input type="password" value={xBearerToken} onChange={event=>setXBearerToken(event.target.value)} autoComplete="off" placeholder={status.xBearerToken?'Already saved':'Paste token'}/></label>
    <label><span>Jupiter API key</span><input type="password" value={jupiterApiKey} onChange={event=>setJupiterApiKey(event.target.value)} autoComplete="off" placeholder={status.jupiterApiKey?'Already saved':'Optional for now'}/></label>
    <label><span>Mainnet RPC URL</span><input value={mainnetRpcUrl} onChange={event=>setMainnetRpcUrl(event.target.value)} placeholder={status.mainnetRpcUrl?'Already saved':'https://...'}/></label>
    <div className="admin-actions"><button disabled={busy}>{busy?'Saving...':'Save'}</button><button type="button" disabled={!operator||busy} onClick={()=>void load()}>Check</button><span>{message}</span></div>
   </form>
   <div className="status-list">
    <div>X bearer token <b>{status.xBearerToken?'Ready':'Missing'}</b></div>
    <div>Jupiter API key <b>{status.jupiterApiKey?'Ready':'Missing'}</b></div>
    <div>Mainnet RPC <b>{status.mainnetRpcUrl?'Ready':'Missing'}</b></div>
   </div>
  </section>
 </main>;
}
