// Telegram webhook. Wiring only: every decision this endpoint makes lives in
// lib/telegram/webhook.ts and lib/telegram/router.ts, which are tested.
//
// validateOrigin() from lib/auth is deliberately absent. Telegram is a
// third-party caller; the secret token is the authentication.

import * as app from '../../../../lib/app';
import {claimTelegramUpdate} from '../../../../lib/db';
import {telegramApi} from '../../../../lib/telegram/api';
import {pendingStore} from '../../../../lib/telegram/pending';
import {route} from '../../../../lib/telegram/router';
import {handleUpdate} from '../../../../lib/telegram/webhook';

export const runtime='nodejs';export const dynamic='force-dynamic';

export async function POST(req:Request):Promise<Response>{
 const out=telegramApi();
 const pending=pendingStore();
 return handleUpdate(req,{
  secret:process.env.TELEGRAM_WEBHOOK_SECRET??'',
  claimUpdate:claimTelegramUpdate,
  route:update=>route(update,{app,out,pending}),
 });
}
