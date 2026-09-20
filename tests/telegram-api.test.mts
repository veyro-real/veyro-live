import test from 'node:test';import assert from 'node:assert/strict';
const {telegramApi}=await import('../lib/telegram/api');

type Call={url:string;body:any};
function fakeFetch(reply:unknown={ok:true,result:{}},status=200){
 const calls:Call[]=[];
 const fn=(async(url:string,init:RequestInit)=>{
  calls.push({url:String(url),body:JSON.parse(String(init.body))});
  return new Response(JSON.stringify(reply),{status,headers:{'content-type':'application/json'}});
 }) as unknown as typeof fetch;
 return {fn,calls};
}

test('sendMessage posts to the bot method with the chat and text',async()=>{
 const f=fakeFetch();
 await telegramApi({token:'123:ABC',fetch:f.fn}).send('99','hello');
 assert.equal(f.calls.length,1);
 assert.equal(f.calls[0].url,'https://api.telegram.org/bot123:ABC/sendMessage');
 assert.equal(f.calls[0].body.chat_id,'99');
 assert.equal(f.calls[0].body.text,'hello');
});

test('a keyboard is sent as an inline reply markup',async()=>{
 const f=fakeFetch();
 await telegramApi({token:'t',fetch:f.fn}).send('99','confirm?',[[{text:'Confirm',callback_data:'b:aa'}]]);
 assert.deepEqual(f.calls[0].body.reply_markup,{inline_keyboard:[[{text:'Confirm',callback_data:'b:aa'}]]});
});

test('no keyboard means no reply markup field at all',async()=>{
 const f=fakeFetch();
 await telegramApi({token:'t',fetch:f.fn}).send('99','plain');
 assert.equal('reply_markup' in f.calls[0].body,false);
});

test('text past the Telegram limit is split across messages, not truncated',async()=>{
 const f=fakeFetch();
 const long='x'.repeat(9000);
 await telegramApi({token:'t',fetch:f.fn}).send('99',long);
 assert.equal(f.calls.length,3);
 for(const c of f.calls)assert.ok(c.body.text.length<=4096);
 assert.equal(f.calls.map(c=>c.body.text).join(''),long);
});

test('a keyboard is attached only to the final chunk',async()=>{
 const f=fakeFetch();
 await telegramApi({token:'t',fetch:f.fn}).send('99','y'.repeat(5000),[[{text:'Confirm',callback_data:'b:aa'}]]);
 assert.equal(f.calls.length,2);
 assert.equal('reply_markup' in f.calls[0].body,false);
 assert.ok('reply_markup' in f.calls[1].body);
});

test('a Telegram level failure is raised, not swallowed',async()=>{
 const f=fakeFetch({ok:false,description:'chat not found'});
 await assert.rejects(()=>telegramApi({token:'t',fetch:f.fn}).send('99','hi'),/chat not found/);
});

test('an HTTP level failure is raised',async()=>{
 const f=fakeFetch({},500);
 await assert.rejects(()=>telegramApi({token:'t',fetch:f.fn}).send('99','hi'),/TELEGRAM_HTTP_500/);
});

test('answering a callback query stops the spinner',async()=>{
 const f=fakeFetch();
 await telegramApi({token:'t',fetch:f.fn}).answer('cb-1');
 assert.equal(f.calls[0].url,'https://api.telegram.org/bott/answerCallbackQuery');
 assert.equal(f.calls[0].body.callback_query_id,'cb-1');
});

test('a missing bot token is a configuration error, not a silent no-op',async()=>{
 await assert.rejects(()=>telegramApi({token:'',fetch:fakeFetch().fn}).send('99','hi'),/TELEGRAM_NOT_CONFIGURED/);
});
