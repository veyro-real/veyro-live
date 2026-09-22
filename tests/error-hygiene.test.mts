import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';

// A caught error carries why something failed. Dropping it turns a one-line
// diagnosis into an outage you debug by bisecting production — which is
// exactly what a `SUPABASE_STORE_ERROR` with no message cost us once.
//
// Silence is sometimes right. It is never right by accident, so every case
// is listed here with the reason it is safe. Add an entry only when losing
// the error genuinely costs the caller nothing.
const ALLOWED:Record<string,{swallows:number;why:string}>={
 'packages/bot/src/engine.ts':{swallows:1,
  why:'The serial queue tail is reset so one rejection does not poison every '+
      'later call. The rejection itself is still delivered to its own caller.'},
 'packages/bot/src/voice/transcribe.ts':{swallows:2,
  why:'A --help probe is host detection, not a failure, and the temp-dir '+
      'cleanup is best effort in a finally.'},
 'packages/bot/src/voice/tts.ts':{swallows:1,
  why:'Temp-dir cleanup in a finally. Failing to unlink must not mask the '+
      'result the caller is waiting for.'},
 'packages/bot/src/telegram/router.ts':{swallows:2,
  why:'Two. The last-resort reply to Telegram: if telling the user about a '+
      'failure also fails there is nowhere left to report it, and the webhook '+
      'still owes Telegram a 200. And answerCallbackQuery, which only '+
      'dismisses the spinner — its id expires in about a minute, so letting '+
      'it throw lost the tap that confirmed a trade.'},
 'apps/control-plane/app/api/state/route.ts':{swallows:1,
  why:'An unauthenticated caller is a valid state for this route, not an '+
      'error: it renders the signed-out view.'},
};

const ROOTS=['packages/bot/src','apps/market-worker/src','apps/telegram-worker/src',
             'apps/campaign-worker/src','apps/control-plane/app'];

// catch{} / catch(e){} with nothing in it, and .catch(()=>{}) with nothing in it.
const EMPTY_CATCH=/catch\s*(?:\([^)]*\))?\s*\{\s*\}/g;
const EMPTY_HANDLER=/\.catch\(\s*\([^)]*\)\s*=>\s*\{\s*\}\s*\)/g;

async function sources(dir:string):Promise<string[]>{
 const out:string[]=[];
 for(const e of await readdir(dir,{withFileTypes:true})){
  const p=join(dir,e.name);
  if(e.isDirectory()){
   if(e.name==='.next'||e.name==='node_modules')continue;
   out.push(...await sources(p));
  }else if(/\.tsx?$/.test(e.name))out.push(p);
 }
 return out;
}

async function swallowsByFile():Promise<Map<string,number>>{
 const found=new Map<string,number>();
 for(const root of ROOTS){
  for(const file of await sources(root)){
   const text=await readFile(file,'utf8');
   const n=(text.match(EMPTY_CATCH)?.length??0)+(text.match(EMPTY_HANDLER)?.length??0);
   if(n>0)found.set(file,n);
  }
 }
 return found;
}

test('no error is discarded without a written reason',async()=>{
 const found=await swallowsByFile();
 const unexplained=[...found].filter(([file])=>!ALLOWED[file]);
 assert.deepEqual(unexplained,[],
  'These files drop a caught error with no recorded reason. Either pass the '+
  'error on with a message that says what failed, or add the file to ALLOWED '+
  'in this test with the reason silence is correct there.');
});

test('a file never grows a new silent catch unnoticed',async()=>{
 const found=await swallowsByFile();
 for(const [file,{swallows}] of Object.entries(ALLOWED)){
  const actual=found.get(file)??0;
  assert.equal(actual,swallows,
   `${file} has ${actual} silent catches, ALLOWED records ${swallows}. `+
   'If the new one is justified, raise the count and extend the reason.');
 }
});

// Keeps the list honest: an entry whose code is gone must go too, or the
// allowlist slowly becomes permission for things nobody checked.
test('the allowlist has no stale entries',async()=>{
 const found=await swallowsByFile();
 const stale=Object.keys(ALLOWED).filter(f=>!found.has(f));
 assert.deepEqual(stale,[],'ALLOWED names files that no longer swallow anything; remove them.');
});

// The specific failure that started this: a helper that received the reason
// and threw a bare constant instead.
test('store errors carry the reason, not just a code',async()=>{
 const store=await readFile('packages/bot/src/store.ts','utf8');
 const thrower=store.match(/function checked[\s\S]*?\n}/)?.[0]??'';
 assert.match(thrower,/error\.message/,
  'checked() must include the underlying message; a bare code hid a '+
  'not-null violation and took the bot down for every command but /start.');
});
