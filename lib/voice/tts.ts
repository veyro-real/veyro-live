// Turning text into a Telegram voice note.
//
// Telegram's sendVoice only accepts OGG/Opus, so whatever synthesises the
// speech gets piped through ffmpeg. The provider here is macOS `say`, which
// means voice notes work on a developer's Mac and NOT in the Linux container
// on Railway. available() reports that honestly rather than failing at send
// time, and the bot simply skips the voice note when it is false.
//
// Swapping in a hosted TTS provider means implementing Speaker and nothing
// else; the encoding and the call site stay as they are.

import {execFile} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {promisify} from 'node:util';

const run=promisify(execFile);

export type Speaker={
 /** Whether this host can actually produce audio right now. */
 available():Promise<boolean>;
 /** OGG/Opus bytes, or null when there is nothing to say or no way to say it. */
 synthesize(text:string):Promise<Buffer|null>;
};

const SILENT:Speaker={available:async()=>false,synthesize:async()=>null};

export function macSpeaker(opts:{voice?:string;sayBin?:string;ffmpegBin?:string}={}):Speaker{
 const say=opts.sayBin??'say';
 const ffmpeg=opts.ffmpegBin??'ffmpeg';
 const voice=opts.voice??process.env.VEYRO_TTS_VOICE??'Samantha';

 async function available():Promise<boolean>{
  if(process.platform!=='darwin'&&opts.sayBin===undefined)return false;
  try{
   await run(say,['-v','?'],{timeout:5000});
   await run(ffmpeg,['-version'],{timeout:5000});
   return true;
  }catch{
   return false;
  }
 }

 return {
  available,
  async synthesize(text){
   if(!text.trim())return null;
   if(!await available())return null;
   let dir:string|undefined;
   try{
    dir=await mkdtemp(join(tmpdir(),'veyro-tts-'));
    const aiff=join(dir,'s.aiff'),ogg=join(dir,'s.ogg');
    // `say` takes the text as an argument, never through a shell.
    await run(say,['-v',voice,'-o',aiff,text],{timeout:30_000});
    await run(ffmpeg,[
     '-y','-hide_banner','-loglevel','error','-i',aiff,
     '-c:a','libopus','-b:a','32k','-ar','48000','-ac','1','-f','ogg',ogg,
    ],{timeout:30_000});
    return await readFile(ogg);
   }catch{
    return null; // A missing voice note is cosmetic; never fail the reply.
   }finally{
    if(dir)await rm(dir,{recursive:true,force:true}).catch(()=>{});
   }
  },
 };
}

/** The speaker for this host. Silent where no synthesiser exists. */
export function speaker():Speaker{
 if(process.env.VEYRO_VOICE_DISABLED==='true')return SILENT;
 return process.platform==='darwin'?macSpeaker():SILENT;
}
