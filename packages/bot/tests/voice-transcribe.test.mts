import test from 'node:test';import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import {mkdtemp,readFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
const run=promisify(execFile);
const {whisperTranscriber,openaiTranscriber,transcriber}=await import('../src/voice/transcribe');

/** Swaps global fetch for the duration of one call and records what was sent. */
async function withFetch<T>(
 handler:(url:string,init:RequestInit)=>Promise<Response>,
 body:(seen:{url:string;init:RequestInit}[])=>Promise<T>,
):Promise<T>{
 const seen:{url:string;init:RequestInit}[]=[];
 const original=globalThis.fetch;
 globalThis.fetch=(async(input:any,init:any={})=>{
  seen.push({url:String(input),init});
  return handler(String(input),init);
 }) as typeof fetch;
 try{return await body(seen);}finally{globalThis.fetch=original;}
}

const ok=(text:string)=>async()=>new Response(JSON.stringify({text}),{status:200});

const t=whisperTranscriber();
const canRun=await t.available();

/** A real ogg/opus voice note, made the way Telegram would deliver one. */
async function spokenOgg(text:string):Promise<Buffer>{
 const dir=await mkdtemp(join(tmpdir(),'veyro-test-'));
 const aiff=join(dir,'a.aiff'),ogg=join(dir,'a.ogg');
 await run('say',['-v','Samantha','-o',aiff,text]);
 await run('ffmpeg',['-y','-hide_banner','-loglevel','error','-i',aiff,
  '-c:a','libopus','-b:a','32k','-ar','48000','-ac','1','-f','ogg',ogg]);
 const buf=await readFile(ogg);
 await rm(dir,{recursive:true,force:true});
 return buf;
}

test('availability is checked, not assumed',async()=>{
 assert.equal(typeof canRun,'boolean');
});

test('empty audio transcribes to nothing rather than throwing',async()=>{
 assert.equal(await t.transcribe(Buffer.alloc(0)),null);
});

test('a missing binary or model degrades to null',async()=>{
 const broken=whisperTranscriber({bin:'/nonexistent/whisper',model:'/nonexistent/model.bin'});
 assert.equal(await broken.available(),false);
 assert.equal(await broken.transcribe(Buffer.from('not audio')),null);
});

test('garbage that is not audio returns null instead of crashing',async()=>{
 assert.equal(await t.transcribe(Buffer.from('definitely not an ogg file')),null);
});

test('the default transcriber reflects the host',async()=>{
 assert.equal(typeof (await transcriber().available()),'boolean');
});

test('a spoken command comes back as text',{skip:!canRun&&'no whisper/model on this host'},async()=>{
 const out=await t.transcribe(await spokenOgg('show me my wallet'));
 assert.ok(out,'expected a transcript');
 assert.match(out!.toLowerCase(),/wallet/);
});

test('numbers survive transcription, which is what limits depend on',{skip:!canRun&&'no whisper/model on this host'},async()=>{
 const out=await t.transcribe(await spokenOgg('set my limits to 0.5 sol per trade, 2 sol daily, for 24 hours'));
 assert.ok(out,'expected a transcript');
 const lower=out!.toLowerCase();
 assert.match(lower,/0\.5/);
 assert.match(lower,/24/);
});

// The hosted transcriber. This is the one that runs on Railway, so it is
// tested against a stubbed endpoint rather than skipped off a Mac.

test('a hosted transcript comes back as text',async()=>{
 const out=await withFetch(ok(' buy one hundred dollars  '),async seen=>{
  const r=await openaiTranscriber({apiKey:'k'}).transcribe(Buffer.from('ogg bytes'));
  assert.equal(seen.length,1);
  assert.match(seen[0].url,/\/audio\/transcriptions$/);
  return r;
 });
 assert.equal(out,'buy one hundred dollars');
});

test('it sends the ogg and the model as multipart, and the key as a header',async()=>{
 await withFetch(ok('hi'),async seen=>{
  await openaiTranscriber({apiKey:'secret-key',model:'gpt-4o-mini-transcribe'})
   .transcribe(Buffer.from('ogg bytes'));
  const {init}=seen[0];
  assert.equal((init.headers as Record<string,string>).Authorization,'Bearer secret-key');
  const form=init.body as FormData;
  assert.equal(form.get('model'),'gpt-4o-mini-transcribe');
  const file=form.get('file') as File;
  assert.equal(file.type,'audio/ogg','the codec is identified by type');
  assert.match(file.name,/\.ogg$/,'and by extension');
 });
});

test('no api key means unavailable, and nothing is sent',async()=>{
 const deaf=openaiTranscriber({apiKey:''});
 assert.equal(await deaf.available(),false);
 await withFetch(ok('x'),async seen=>{
  assert.equal(await deaf.transcribe(Buffer.from('ogg')),null);
  assert.equal(seen.length,0,'called the API without a key');
 });
});

test('empty and oversized audio never reach the network',async()=>{
 const t=openaiTranscriber({apiKey:'k'});
 await withFetch(ok('x'),async seen=>{
  assert.equal(await t.transcribe(Buffer.alloc(0)),null);
  assert.equal(await t.transcribe(Buffer.alloc(25*1024*1024)),null);
  assert.equal(seen.length,0);
 });
});

test('an upstream failure degrades to null rather than throwing',async()=>{
 const t=openaiTranscriber({apiKey:'k'});
 for(const status of [401,429,500]){
  const out=await withFetch(async()=>new Response('upstream detail',{status}),
   ()=>t.transcribe(Buffer.from('ogg')));
  assert.equal(out,null,'status '+status);
 }
 const thrown=await withFetch(async()=>{throw Error('socket hang up');},
  ()=>t.transcribe(Buffer.from('ogg')));
 assert.equal(thrown,null);
});

test('a response with no speech in it is nothing, not an empty string',async()=>{
 const t=openaiTranscriber({apiKey:'k'});
 assert.equal(await withFetch(ok('   '),()=>t.transcribe(Buffer.from('ogg'))),null);
 assert.equal(
  await withFetch(async()=>new Response('{}',{status:200}),()=>t.transcribe(Buffer.from('ogg'))),
  null);
});

test('an api key selects the hosted transcriber over a local model',async()=>{
 const before=process.env.OPENAI_API_KEY;
 try{
  process.env.OPENAI_API_KEY='k';
  assert.equal(await transcriber().available(),true,'a key means the bot can hear');
  process.env.VEYRO_VOICE_DISABLED='true';
  assert.equal(await transcriber().available(),false,'the off switch still wins');
 }finally{
  delete process.env.VEYRO_VOICE_DISABLED;
  if(before===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=before;
 }
});
