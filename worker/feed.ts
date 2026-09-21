// The launch feed process.
//
// Wiring only. Every decision lives in lib/market: ingest routes frames,
// the observer holds tokens through their window, settle measures and
// judges them, the heartbeat notices silence. This file connects a socket
// to those and does nothing else, which is what makes them testable.

import {recordAssessment,recordCandidate} from '../lib/db';
import {readMintFacts,rpcReader} from '../lib/market/features';
import {createHeartbeat} from '../lib/market/heartbeat';
import {createObserver} from '../lib/market/observer';
import {createDrainer,type SettleDeps} from '../lib/market/settle';
import {
 SUBSCRIPTIONS,handleFeedMessage,unwatchTrades,watchTrades,type IngestDeps,
} from '../lib/market/ingest';
import {telegramApi} from '../lib/telegram/api';

const WS_URL=process.env.PUMPPORTAL_WS_URL||'wss://pumpportal.fun/api/data';
const WINDOW_MS=Number(process.env.VEYRO_OBSERVE_MS||60_000);
const MAX_WATCHED=Number(process.env.VEYRO_MAX_WATCHED||150);
const GAP_MS=Number(process.env.VEYRO_ASSESS_GAP_MS||400);
const QUIET_MS=Number(process.env.VEYRO_FEED_QUIET_MS||300_000);
const ALERT_CHAT=process.env.VEYRO_ALERT_CHAT_ID||'';

const log=(...a:unknown[])=>console.log(new Date().toISOString(),...a);

const observer=createObserver({windowMs:WINDOW_MS,maxWatched:MAX_WATCHED});
const heartbeat=createHeartbeat({quietMs:QUIET_MS,startedAt:Date.now()});
const reader=rpcReader();
const out=telegramApi();

let socket:WebSocket|undefined;
let launches=0,trades=0,settled=0;

const send=(payload:unknown)=>{
 if(socket&&socket.readyState===WebSocket.OPEN)socket.send(JSON.stringify(payload));
};

/** Best effort: an alert that cannot be delivered must not stop the feed. */
async function alert(text:string):Promise<void>{
 log('ALERT',text);
 if(!ALERT_CHAT)return;
 try{
  await out.send(ALERT_CHAT,text);
 }catch(e){
  log('alert delivery failed',(e as Error).message);
 }
}

const settleDeps:SettleDeps={
 readFacts:(mint,curve)=>readMintFacts(mint,reader,curve),
 record:async(mint,payload)=>{
  await recordAssessment(mint,payload);
  settled++;
  const a=payload as {passed:boolean;score:number;rejections:string[];flow:{uniqueBuyers:number;netSol:number}};
  log(a.passed?'PASS':'reject',mint,
   a.passed?('score '+a.score):a.rejections.join(','),
   '| buyers '+a.flow.uniqueBuyers+' net '+a.flow.netSol+' SOL');
 },
 unwatch:mint=>send(unwatchTrades(mint)),
 onError:(mint,e)=>log('settle failed',mint,(e as Error).message),
};

const drainer=createDrainer(observer,settleDeps,{gapMs:GAP_MS});

const ingestDeps:IngestDeps={
 async recordCandidate(candidate){
  launches++;
  heartbeat.seen(Date.now());
  await recordCandidate(candidate);
 },
 async assessAndRecord(candidate,liquiditySol,bondingCurveKey){
  // Not judged here. Held under observation and settled when it closes.
  if(observer.open(candidate,Date.now(),{liquiditySol,bondingCurveKey})){
   send(watchTrades(candidate.mint));
  }
 },
 onTrade(trade){
  if(observer.record(trade))trades++;
 },
 onError:e=>log('ingest error',(e as Error).message),
};

function connect(attempt=0):void{
 log('connecting',WS_URL);
 const ws=new WebSocket(WS_URL);
 socket=ws;

 ws.addEventListener('open',()=>{
  log('connected');
  attempt=0;
  for(const s of SUBSCRIPTIONS)ws.send(JSON.stringify(s));
  // Anything still under observation needs its stream back.
  for(const mint of observer.watching())ws.send(JSON.stringify(watchTrades(mint)));
 });
 ws.addEventListener('message',ev=>{void handleFeedMessage(String(ev.data),ingestDeps);});
 ws.addEventListener('error',()=>{/* close follows; reconnect happens there */});
 ws.addEventListener('close',()=>{
  const wait=Math.min(30_000,1000*2**attempt);
  log('disconnected, reconnecting in',wait+'ms');
  setTimeout(()=>connect(attempt+1),wait);
 });
}

setInterval(()=>{void drainer.run(Date.now());},2_000);
setInterval(()=>{
 const a=heartbeat.check(Date.now());
 if(a)void alert(a.text);
},30_000);
setInterval(()=>log(
 'launches',launches,'trades',trades,'settled',settled,'watching',observer.watching().length,
),60_000);

for(const signal of ['SIGINT','SIGTERM'] as const){
 process.on(signal,()=>{
  log('shutting down; launches',launches,'settled',settled);
  process.exit(0);
 });
}

connect();
void alert('Feed worker started. Observation window '+(WINDOW_MS/1000)+'s.');
