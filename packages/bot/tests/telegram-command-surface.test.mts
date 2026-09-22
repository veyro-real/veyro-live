process.env.VEYRO_STORE='memory';
import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseCommand} from '../src/telegram/parse';
import {help} from '../src/telegram/render';
const {route}=await import('../src/telegram/router');
import type {Deps,Sent} from '../src/telegram/router';

/**
 * Commands the parser answers but /help does not name, and why. Anything not
 * here has to be discoverable: a command nobody can find is a command nobody
 * uses, and the previous test hardcoded eleven of them while the parser had
 * grown to twenty-two.
 */
const UNLISTED:Record<string,string>={
 chatid:'operator helper for wiring feed alerts, not part of the product',
 deposit:'alias for /fund, which help names',
 guide:'alias for /tutorial, which help names',
};

/** The parser is the source of truth; reading it means the list cannot drift. */
async function parserCommands():Promise<string[]>{
 const src=await readFile(new URL('../src/telegram/parse.ts',import.meta.url),'utf8');
 return [...new Set([...src.matchAll(/case '([a-z]+)':/g)].map(m=>m[1]!))].sort();
}

const USER={id:'u-1',telegramChatId:'99',telegramUsername:'j',walletPubkey:'Wa11et',
 mode:'paper',paperLamports:'5000000000',createdAt:''};

function harness(){
 const sent:Sent[]=[];
 const app=new Proxy({},{get:(_t,name)=>{
  if(name==='ensureUser')return async()=>USER;
  if(name==='ensureWallet')return async()=>({pubkey:'Wa11et',lamports:'0'});
  if(name==='tradingMode')return async()=>({mode:'paper',paperLamports:'5000000000'});
  if(name==='getLimits'||name==='getStrategy'||name==='explain')return async()=>null;
  return async()=>[];
 }}) as Deps['app'];
 const deps={
  app,
  out:{send:async(chatId:string,text:string)=>{sent.push({chatId,text} as Sent);},
       answer:async()=>{},photo:async()=>{},voiceNote:async()=>{},edit:async()=>{}},
  pendingAction:{put:async()=>{},take:async()=>null,clear:async()=>{}},
  pending:{put:async()=>{},take:async()=>null},
  image:async()=>null,
 } as unknown as Deps;
 return {sent,deps};
}

test('every command the parser accepts is either in /help or recorded as unlisted',async()=>{
 const listed=help();
 const missing=(await parserCommands())
  .filter(c=>!listed.includes('/'+c))
  .filter(c=>!UNLISTED[c]);
 assert.deepEqual(missing,[],
  'These commands answer but are not discoverable. Add them to /help, or to '+
  'UNLISTED in this test with the reason they stay hidden.');
});

test('the unlisted record has no stale entries',async()=>{
 const commands=await parserCommands();
 const gone=Object.keys(UNLISTED).filter(c=>!commands.includes(c));
 assert.deepEqual(gone,[],'UNLISTED names commands the parser no longer accepts.');
});

test('no command the parser accepts parses as unknown',async()=>{
 for(const c of await parserCommands()){
  assert.notEqual(parseCommand('/'+c).kind,'unknown',`/${c} parses as unknown`);
 }
});

test('every command answers something, and never "I did not recognise that"',async()=>{
 for(const c of await parserCommands()){
  const h=harness();
  await route({update_id:1,message:{message_id:1,chat:{id:99},from:{username:'j'},
   text:'/'+c}} as never,h.deps);
  assert.ok(h.sent.length>0,`/${c} answered nothing`);
  const text=h.sent.map(s=>s.text).join('\n');
  assert.doesNotMatch(text,/did not recognise/,`/${c} is not routed`);
  assert.doesNotMatch(text,/Unsupported state|authenticate data/,`/${c} leaked a crypto error`);
 }
});
