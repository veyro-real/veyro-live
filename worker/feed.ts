// The launch feed process.
//
// Next.js cannot hold a websocket open, so this runs as its own Railway
// service. It does one thing: read PumpPortal, store every launch, and
// measure what it can without melting the RPC.
//
// Measurement is deliberately bounded. Launches arrive faster than a public
// RPC will answer, so assessments run one at a time behind a short queue. If
// the queue is full the candidate is still stored, just unassessed, and a
// later pass can pick it up. Dropping a measurement is recoverable; wedging
// the process behind a thousand queued RPC calls is not.

import {recordAssessment,recordCandidate} from '../lib/db';
import {assess} from '../lib/market/filter';
import {buildFeatures,readMintFacts,rpcReader} from '../lib/market/features';
import {SUBSCRIPTIONS,handleFeedMessage,type IngestDeps} from '../lib/market/ingest';
import type {Candidate} from '../lib/types';

const WS_URL=process.env.PUMPPORTAL_WS_URL||'wss://pumpportal.fun/api/data';
const MAX_QUEUE=Number(process.env.VEYRO_ASSESS_QUEUE||25);
const MIN_GAP_MS=Number(process.env.VEYRO_ASSESS_GAP_MS||400);

const log=(...a:unknown[])=>console.log(new Date().toISOString(),...a);

type Job={candidate:Candidate;liquiditySol:number|null;bondingCurveKey:string|null};
const queue:Job[]=[];
let draining=false,measured=0,dropped=0,seen=0;

const reader=rpcReader();

async function measure({candidate,liquiditySol,bondingCurveKey}:Job):Promise<void>{
 const facts=await readMintFacts(candidate.mint,reader,bondingCurveKey);
 const features=buildFeatures(candidate,liquiditySol,facts);
 const assessment=assess(candidate,features);
 await recordAssessment(candidate.mint,assessment);
 measured++;
 log(assessment.passed?'PASS':'reject',candidate.symbol,candidate.mint,
     assessment.passed?('score '+assessment.score):assessment.rejections.join(','));
}

async function drain():Promise<void>{
 if(draining)return;
 draining=true;
 while(queue.length){
  const job=queue.shift()!;
  try{
   await measure(job);
  }catch(e){
   log('measure failed',job.candidate.mint,(e as Error).message);
  }
  await new Promise(r=>setTimeout(r,MIN_GAP_MS));
 }
 draining=false;
}

const deps:IngestDeps={
 recordCandidate:async candidate=>{seen++;await recordCandidate(candidate);},
 assessAndRecord:async(candidate,liquiditySol,bondingCurveKey)=>{
  if(queue.length>=MAX_QUEUE){dropped++;return;}
  queue.push({candidate,liquiditySol,bondingCurveKey});
  void drain();
 },
 onError:e=>log('ingest error',(e as Error).message),
};

function connect(attempt=0):void{
 log('connecting',WS_URL);
 const ws=new WebSocket(WS_URL);

 ws.addEventListener('open',()=>{
  log('connected');
  for(const s of SUBSCRIPTIONS)ws.send(JSON.stringify(s));
 });
 ws.addEventListener('message',ev=>{void handleFeedMessage(String(ev.data),deps);});
 ws.addEventListener('error',()=>{/* close follows; reconnect happens there */});
 ws.addEventListener('close',()=>{
  // Exponential backoff to 30s. The feed drops connections routinely.
  const wait=Math.min(30_000,1000*2**attempt);
  log('disconnected, reconnecting in',wait+'ms');
  setTimeout(()=>connect(attempt+1),wait);
 });

 ws.addEventListener('open',()=>{attempt=0;});
}

setInterval(()=>log('seen',seen,'measured',measured,'dropped',dropped,'queued',queue.length),60_000);

for(const signal of ['SIGINT','SIGTERM'] as const){
 process.on(signal,()=>{log('shutting down; seen',seen,'measured',measured);process.exit(0);});
}

connect();
