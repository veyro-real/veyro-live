import test from 'node:test';import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import {mkdtemp,readFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
const run=promisify(execFile);
const {whisperTranscriber,transcriber}=await import('../lib/voice/transcribe');

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
