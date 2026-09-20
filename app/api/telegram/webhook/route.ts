// Telegram webhook. Wiring only: every decision this endpoint makes lives in
// lib/telegram/webhook.ts and lib/telegram/router.ts, which are tested.
//
// validateOrigin() from lib/auth is deliberately absent. Telegram is a
// third-party caller; the secret token is the authentication.

import * as app from '../../../../lib/app';
import {claimTelegramUpdate} from '../../../../lib/db';
import {resolveImage} from '../../../../lib/market/metadata';
import {setVoiceEnabled,voiceEnabled} from '../../../../lib/voice/prefs';
import {speaker} from '../../../../lib/voice/tts';
import {transcriber} from '../../../../lib/voice/transcribe';
import {actionStore} from '../../../../lib/voice/actions';
import {telegramApi,telegramFiles} from '../../../../lib/telegram/api';
import {pendingStore} from '../../../../lib/telegram/pending';
import {route} from '../../../../lib/telegram/router';
import {handleUpdate} from '../../../../lib/telegram/webhook';

export const runtime='nodejs';export const dynamic='force-dynamic';

export async function POST(req:Request):Promise<Response>{
 const out=telegramApi();
 const pending=pendingStore();
 // Silent on hosts with no synthesiser; the bot just skips the audio.
 const tts=speaker();
 const stt=transcriber();
 const files=telegramFiles();
 return handleUpdate(req,{
  secret:process.env.TELEGRAM_WEBHOOK_SECRET??'',
  claimUpdate:claimTelegramUpdate,
  route:update=>route(update,{
   app,out,pending,
   image:uri=>resolveImage(uri),
   voice:{
    enabled:voiceEnabled,setEnabled:setVoiceEnabled,
    say:text=>tts.synthesize(text),
    hear:async fileId=>{
     const ogg=await files.fetchFile(fileId);
     return ogg?stt.transcribe(ogg):null;
    },
   },
   pendingAction:actionStore(),
  }),
 });
}
