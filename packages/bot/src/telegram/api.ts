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
  // Telegram puts the actual reason in the body of a 4xx, so reading only
  // the status throws away the one part worth having. "TELEGRAM_HTTP_400"
  // says nothing; "wrong file identifier" says where to look.
  if(!res.ok){
   const detail=await res.json().then(
    (b:{description?:string})=>b?.description,
   ).catch(()=>undefined);
   throw Error('TELEGRAM_HTTP_'+res.status+(detail?': '+detail:''));
  }
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
  async edit(chatId,messageId,text,keyboard){
   // A tap that changes nothing leaves the text identical and Telegram
   // answers 'message is not modified'. That is not a failure worth raising.
   try{
    await call('editMessageText',{
     chat_id:chatId,
     message_id:messageId,
     text:chunk(text)[0],
     disable_web_page_preview:true,
     ...(keyboard?{reply_markup:{inline_keyboard:keyboard satisfies InlineKeyboard}}:{}),
    });
   }catch(e){
    if(!/not modified/i.test((e as Error).message))throw e;
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

/**
 * Fetching a file the user sent. Two hops: getFile resolves a file_id to a
 * path, then the file endpoint serves the bytes. Null on any failure, since
 * an unreadable voice note is something the bot reports, not something it
 * crashes on.
 */
export function telegramFiles(opts:{token?:string;fetch?:typeof fetch}={}){
 const http=opts.fetch??fetch;
 const token=()=>{
  const t=opts.token??process.env.TELEGRAM_BOT_TOKEN??'';
  if(!t)throw Error('TELEGRAM_NOT_CONFIGURED');
  return t;
 };
 return {
  async fetchFile(fileId:string):Promise<Buffer|null>{
   try{
    const meta=await http('https://api.telegram.org/bot'+token()+'/getFile?file_id='+encodeURIComponent(fileId));
    if(!meta.ok)return null;
    const body=await meta.json() as {ok:boolean;result?:{file_path?:string}};
    const path=body.result?.file_path;
    if(!body.ok||!path)return null;
    const file=await http('https://api.telegram.org/file/bot'+token()+'/'+path);
    if(!file.ok)return null;
    return Buffer.from(await file.arrayBuffer());
   }catch{
    return null;
   }
  },
 };
}
