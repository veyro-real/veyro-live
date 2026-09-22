// Telegram webhook. Wiring only: every decision this endpoint makes lives in
// lib/telegram/webhook.ts and lib/telegram/router.ts, which are tested.
//
// validateOrigin() from lib/auth is deliberately absent. Telegram is a
// third-party caller; the secret token is the authentication.

import * as app from '@veyro/bot/app';
import {claimTelegramUpdate} from '@veyro/bot/db';
import {resolveImage} from '@veyro/bot/market/metadata';
import {setVoiceEnabled,voiceEnabled} from '@veyro/bot/voice/prefs';
import {speaker} from '@veyro/bot/voice/tts';
import {transcriber} from '@veyro/bot/voice/transcribe';
import {actionStore} from '@veyro/bot/voice/actions';
import {telegramApi,telegramFiles} from '@veyro/bot/telegram/api';
import {quote} from '@veyro/bot/trade/jupiter';
import {usdToSolOrNull} from '@veyro/bot/trade/price';
import {pendingStore} from '@veyro/bot/telegram/pending';
import {route} from '@veyro/bot/telegram/router';
import {handleUpdate} from '@veyro/bot/telegram/webhook';

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
   usdToSol:usd=>usdToSolOrNull(usd,{quote}),
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
