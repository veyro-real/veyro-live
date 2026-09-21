import test from 'node:test';import assert from 'node:assert/strict';
const {route}=await import('../src/telegram/router');
import type {Deps,Sent} from '../src/telegram/router';

const USER={id:'u-1',telegramChatId:'99',telegramUsername:'jeremy',walletPubkey:'Wa11et',createdAt:''};

function harness(ensureWallet:Deps['app']['ensureWallet']){
 const sent:Sent[]=[];
 const deps={
  app:{ensureUser:async()=>USER,ensureWallet} as unknown as Deps['app'],
  out:{send:async(chatId:string,text:string)=>{sent.push({chatId,text} as Sent);},
       answer:async()=>{},photo:async()=>{},voice:async()=>{},file:async()=>null},
  pendingAction:{put:async()=>{},take:async()=>null,clear:async()=>{}},
  pending:{put:async()=>{},take:async()=>null},
 } as unknown as Deps;
 return {sent,deps};
}

const ask=async(h:ReturnType<typeof harness>)=>{
 await route({update_id:1,message:{message_id:1,chat:{id:99},from:{username:'jeremy'},text:'/wallet'}} as never,h.deps);
 return h.sent.map(s=>s.text).join('\n');
};

test('a known balance is reported as a number',async()=>{
 const text=await ask(harness(async()=>({pubkey:'Wa11et',lamports:'500000000'})));
 assert.match(text,/Balance: 0\.5 SOL/);
});

test('an empty wallet says zero',async()=>{
 const text=await ask(harness(async()=>({pubkey:'Wa11et',lamports:'0'})));
 assert.match(text,/Balance: 0 SOL/);
});

// The balance read is allowed to fail without blocking the deposit address.
// It is not allowed to render as "0 SOL": someone who just deposited would
// read that as their funds being gone.
test('an unreadable balance is never rendered as zero',async()=>{
 const text=await ask(harness(async()=>({pubkey:'Wa11et',lamports:null})));
 assert.doesNotMatch(text,/Balance: 0 SOL/);
 assert.match(text,/Wa11et/);
 assert.match(text,/could not|unavailable|couldn't/i);
});
