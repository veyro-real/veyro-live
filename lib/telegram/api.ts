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

 async function call(method:string,payload:Record<string,unknown>):Promise<void>{
  const token=opts.token??process.env.TELEGRAM_BOT_TOKEN??'';
  if(!token)throw Error('TELEGRAM_NOT_CONFIGURED');
  const res=await http('https://api.telegram.org/bot'+token+'/'+method,{
   method:'POST',
   headers:{'content-type':'application/json'},
   body:JSON.stringify(payload),
  });
  if(!res.ok)throw Error('TELEGRAM_HTTP_'+res.status);
  const body=await res.json() as {ok:boolean;description?:string};
  if(!body.ok)throw Error('TELEGRAM_API: '+(body.description??'unknown'));
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
  async answer(callbackQueryId,text){
   await call('answerCallbackQuery',{callback_query_id:callbackQueryId,...(text?{text}:{})});
  },
 };
}
