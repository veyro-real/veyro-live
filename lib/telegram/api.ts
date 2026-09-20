// The Telegram Bot API client. The only place in the bot that talks to
// api.telegram.org.

import type {InlineKeyboard} from './types';
import type {Outbox} from './router';

/** Telegram rejects a message body over 4096 characters. */
const LIMIT=4096;

/** Split without losing a character, preferring a line break to a hard cut. */
export function chunk(text:string,limit=LIMIT):string[]{
 if(text.length<=limit)return [text];
 const out:string[]=[];
 let rest=text;
 while(rest.length>limit){
  const nl=rest.slice(0,limit).lastIndexOf('\n');
  const cut=nl>limit/2?nl+1:limit;
  out.push(rest.slice(0,cut));
  rest=rest.slice(cut);
 }
 if(rest)out.push(rest);
 return out;
}

export function telegramApi(opts:{token?:string;fetch?:typeof fetch}={}):Outbox{
 const http=opts.fetch??fetch;

 function endpoint(method:string):string{
  const token=opts.token??process.env.TELEGRAM_BOT_TOKEN??'';
  if(!token)throw Error('TELEGRAM_NOT_CONFIGURED');
  return 'https://api.telegram.org/bot'+token+'/'+method;
 }

 async function check(res:Response):Promise<void>{
  if(!res.ok)throw Error('TELEGRAM_HTTP_'+res.status);
  const body=await res.json() as {ok:boolean;description?:string};
  if(!body.ok)throw Error('TELEGRAM_API: '+(body.description??'unknown'));
 }

 async function upload(method:string,form:FormData):Promise<void>{
  // No content-type header: fetch sets the multipart boundary itself.
  await check(await http(endpoint(method),{method:'POST',body:form}));
 }

 async function call(method:string,payload:Record<string,unknown>):Promise<void>{
  await check(await http(endpoint(method),{
   method:'POST',
   headers:{'content-type':'application/json'},
   body:JSON.stringify(payload),
  }));
 }

 return {
  async send(chatId,text,keyboard){
   const parts=chunk(text);
   for(let i=0;i<parts.length;i++){
    // The keyboard belongs on the last chunk, where the user ends up.
    const last=i===parts.length-1;
    await call('sendMessage',{
     chat_id:chatId,
     text:parts[i],
     disable_web_page_preview:true,
     ...(last&&keyboard?{reply_markup:{inline_keyboard:keyboard satisfies InlineKeyboard}}:{}),
    });
   }
  },
  async photo(chatId,imageUrl,caption,keyboard){
   await call('sendPhoto',{
    chat_id:chatId,
    photo:imageUrl,
    // Telegram rejects a caption over 1024 characters outright.
    caption:caption.slice(0,1024),
    ...(keyboard?{reply_markup:{inline_keyboard:keyboard}}:{}),
   });
  },
  async voiceNote(chatId,ogg){
   // Audio is bytes we produced, so it is uploaded rather than linked.
   const form=new FormData();
   form.append('chat_id',chatId);
   form.append('voice',new Blob([new Uint8Array(ogg)],{type:'audio/ogg'}),'voice.ogg');
   await upload('sendVoice',form);
  },
  async answer(callbackQueryId,text){
   await call('answerCallbackQuery',{callback_query_id:callbackQueryId,...(text?{text}:{})});
  },
 };
}
