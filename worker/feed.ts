// The launch feed process.
//
// Next.js cannot hold a websocket open, so this runs as its own Railway
// service. It does four things: read every launch, watch each one's trades
// for an observation window, measure what it can without melting the RPC,
// and shout on Telegram when the feed goes quiet.
//
// Judging a token at creation tells you almost nothing, so nothing is
// assessed on arrival. A launch is recorded immediately and then held under
// observation; the assessment happens when its window closes and the order
// flow is in hand.
//
// Every buffer is bounded and evicts rather than grows. Launches arrive
// faster than windows close and far faster than a public RPC answers, so
// the failure mode has to be losing a measurement, never losing the process.

import {recordAssessment,recordCandidate} from '../lib/db';
import {assess} from '../lib/market/filter';
import {buildFeatures,readMintFacts,rpcReader} from '../lib/market/features';
import {flowFeatures} from '../lib/market/flow';
import {createHeartbeat} from '../lib/market/heartbeat';
import {createObserver,type Watch} from '../lib/market/observer';
import {
 SUBSCRIPTIONS,handleFeedMessage,unwatchTrades,watchTrades,type IngestDeps,
} from '../lib/market/ingest';
import {telegramApi} from '../lib/telegram/api';

const WS_URL=process.env.PUMPPORTAL_WS_URL||'wss://pumpportal.fun/api/data';
const WINDOW_MS=Number(process.env.VEYRO_OBSERVE_MS||60_000);
const MAX_WATCHED=Number(process.env.VEYRO_MAX_WATCHED||150);
const MIN_GAP_MS=Number(process.env.VEYRO_ASSESS_GAP_MS||400);
const QUIET_MS=Number(process.env.VEYRO_FEED_QUIET_MS||300_000);
const ALERT_CHAT=process.env.VEYRO_ALERT_CHAT_ID||'';

const log=(...a:unknown[])=>console.log(new Date().toISOString(),...a);

const observer=createObserver({windowMs:WINDOW_MS,maxWatched:MAX_WATCHED});
const heartbeat=createHeartbeat({quietMs:QUIET_MS,startedAt:Date.now()});
const reader=rpcReader();
const out=telegramApi();

let socket:WebSocket|undefined;
let launches=0,assessed=0,passed=0,tradesSeen=0;

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

const send=(payload:unknown)=>{
 if(socket&&socket.readyState===WebSocket.OPEN)socket.send(JSON.stringify(payload));
};

/** A window has closed: measure the flow, measure the mint, judge, store. */
async function settle(watch:Watch):Promise<void>{
 observer.close(watch.candidate.mint);
 send(unwatchTrades(watch.candidate.mint));

 const flow=flowFeatures(watch.trades,{
  windowStart:watch.windowStart,
  windowEnd:watch.windowEnd,
  creator:watch.candidate.creator,
 });

 const facts=await readMintFacts(watch.candidate.mint,reader,watch.bondingCurveKey);
 const liquidity=watch.trades.at(-1)?.curveSol??watch.liquiditySol;
 const features=buildFeatures(watch.candidate,liquidity,facts,{
  buys:flow.buys,sells:flow.sells,uniqueBuyers:flow.uniqueBuyers,
 });
 const assessment=assess(watch.candidate,features);

 // The richer flow measurements ride alongside; Features has no fields for
 // them and this is research data, not something the filter reads yet.
 await recordAssessment(watch.candidate.mint,{...assessment,flow});

 assessed++;
 if(assessment.passed)passed++;
 log(assessment.passed?'PASS':'reject',watch.candidate.symbol,watch.candidate.mint,
  assessment.passed?('score '+assessment.score):assessment.rejections.join(','),
  '| buyers '+flow.uniqueBuyers+' net '+flow.netSol+' SOL accel '+flow.buyerAcceleration);
}

let settling=false;
async function drain(now:number):Promise<void>{
 if(settling)return;
 settling=true;
 try{
  for(const watch of observer.due(now)){
   try{
    await settle(watch);
   }catch(e){
    observer.close(watch.candidate.mint);
    send(unwatchTrades(watch.candidate.mint));
    log('settle failed',watch.candidate.mint,(e as Error).message);
   }
   await new Promise(r=>setTimeout(r,MIN_GAP_MS));
  }
 }finally{
  settling=false;
 }
}

const deps:IngestDeps={
 async recordCandidate(candidate){
  launches++;
  heartbeat.seen(Date.now());
  await recordCandidate(candidate);
 },
 async assessAndRecord(candidate,liquiditySol,bondingCurveKey){
  // Not assessed here. Opened for observation; judged when the window closes.
  if(observer.open(candidate,Date.now(),{liquiditySol,bondingCurveKey})){
   send(watchTrades(candidate.mint));
  }
 },
 onTrade(trade){
  if(observer.record(trade))tradesSeen++;
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
  // Re-subscribe to anything still under observation across a reconnect.
  for(const mint of observer.watching())ws.send(JSON.stringify(watchTrades(mint)));
 });
 ws.addEventListener('message',ev=>{void handleFeedMessage(String(ev.data),deps);});
 ws.addEventListener('error',()=>{/* close follows; reconnect happens there */});
 ws.addEventListener('close',()=>{
  const wait=Math.min(30_000,1000*2**attempt);
  log('disconnected, reconnecting in',wait+'ms');
  setTimeout(()=>connect(attempt+1),wait);
 });
}

setInterval(()=>{void drain(Date.now());},2_000);

setInterval(()=>{
 const a=heartbeat.check(Date.now());
 if(a)void alert(a.text);
},30_000);

setInterval(()=>log(
 'launches',launches,'trades',tradesSeen,'assessed',assessed,'passed',passed,
 'watching',observer.watching().length,
),60_000);

for(const signal of ['SIGINT','SIGTERM'] as const){
 process.on(signal,()=>{
  log('shutting down; launches',launches,'assessed',assessed,'passed',passed);
  process.exit(0);
 });
}

connect();
void alert('Feed worker started. Observation window '+(WINDOW_MS/1000)+'s.');
