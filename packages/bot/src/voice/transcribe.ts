// Turning a Telegram voice note into text.
//
// Two implementations behind one interface. OpenAI accepts Telegram's
// OGG/Opus as delivered, so it needs neither ffmpeg nor a local model and is
// the only one of the two that works in the Linux container on Railway.
// whisper.cpp stays for local work and for running without a network call.
//
// available() says which, so the bot can answer "I cannot hear voice notes
// here" instead of silently ignoring them.

import {execFile} from 'node:child_process';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {promisify} from 'node:util';

const run=promisify(execFile);

export type Transcriber={
 available():Promise<boolean>;
 /** Plain text, or null when there is nothing to hear or no way to hear it. */
 transcribe(ogg:Buffer):Promise<string|null>;
};

const DEAF:Transcriber={available:async()=>false,transcribe:async()=>null};

const DEFAULT_MODEL='/Users/jeremy/Library/Application Support/ru.starmel.OpenSuperWhisper/whisper-models/ggml-large-v3-turbo.bin';

export function whisperTranscriber(opts:{bin?:string;model?:string;ffmpegBin?:string}={}):Transcriber{
 const bin=opts.bin??process.env.VEYRO_WHISPER_BIN??'whisper-cli';
 const model=opts.model??process.env.VEYRO_WHISPER_MODEL??DEFAULT_MODEL;
 const ffmpeg=opts.ffmpegBin??'ffmpeg';

 async function available():Promise<boolean>{
  try{
   await run(ffmpeg,['-version'],{timeout:5000});
   // -h exits non-zero on some builds, so a model read is the real check.
   await readFile(model,{flag:'r'}).catch(()=>{throw Error('no model');});
   await run(bin,['--help'],{timeout:10_000}).catch(()=>{});
   return true;
  }catch{
   return false;
  }
 }

 return {
  available,
  async transcribe(ogg){
   if(ogg.length===0)return null;
   if(!await available())return null;
   let dir:string|undefined;
   try{
    dir=await mkdtemp(join(tmpdir(),'veyro-stt-'));
    const src=join(dir,'in.ogg'),wav=join(dir,'in.wav');
    await writeFile(src,ogg);
    await run(ffmpeg,[
     '-y','-hide_banner','-loglevel','error','-i',src,
     '-ar','16000','-ac','1','-c:a','pcm_s16le',wav,
    ],{timeout:30_000});
    const {stdout}=await run(bin,
     ['-m',model,'-f',wav,'-nt','-np','-l','en'],
     {timeout:120_000,maxBuffer:4*1024*1024});
    const text=stdout.replace(/\s+/g,' ').trim();
    return text||null;
   }catch{
    return null; // Unreadable audio. The router tells the user it could not hear.
   }finally{
    if(dir)await rm(dir,{recursive:true,force:true}).catch(()=>{});
   }
  },
 };
}

/** Telegram caps voice notes well below this; it bounds a malformed update. */
const MAX_BYTES=24*1024*1024;

export function openaiTranscriber(opts:{apiKey?:string;model?:string;baseUrl?:string}={}):Transcriber{
 const apiKey=opts.apiKey??process.env.OPENAI_API_KEY??'';
 const model=opts.model??process.env.VEYRO_TRANSCRIBE_MODEL??'gpt-4o-mini-transcribe';
 const baseUrl=opts.baseUrl??process.env.OPENAI_BASE_URL??'https://api.openai.com/v1';

 return {
  available:async()=>apiKey.length>0,
  async transcribe(ogg){
   if(ogg.length===0||ogg.length>MAX_BYTES||!apiKey)return null;
   try{
    const form=new FormData();
    // The extension and type are what the API identifies the codec by.
    form.append('file',new Blob([new Uint8Array(ogg)],{type:'audio/ogg'}),'voice.ogg');
    form.append('model',model);
    form.append('response_format','json');
    const res=await fetch(baseUrl+'/audio/transcriptions',{
     method:'POST',
     headers:{Authorization:'Bearer '+apiKey},
     body:form,
     signal:AbortSignal.timeout(60_000),
    });
    // Body may carry the request back; never widen this past the status.
    if(!res.ok)throw Error('OPENAI_HTTP_'+res.status);
    const text=String((await res.json() as {text?:unknown}).text??'').replace(/\s+/g,' ').trim();
    return text||null;
   }catch{
    return null; // The router tells the user it could not hear.
   }
  },
 };
}

export function transcriber():Transcriber{
 if(process.env.VEYRO_VOICE_DISABLED==='true')return DEAF;
 if(process.env.OPENAI_API_KEY)return openaiTranscriber();
 return whisperTranscriber();
}
