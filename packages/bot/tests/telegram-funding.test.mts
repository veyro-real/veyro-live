import test from 'node:test';import assert from 'node:assert/strict';
import {walletMessage,ONRAMP_URL} from '../src/telegram/render';

const ADDR='L9A73hQeAqPqW1vYt7nJmKpR2sXyZbCdEfGhJkLmSgte';

test('the deposit screen leads with the address',()=>{
 const {text}=walletMessage(ADDR,'250000000');
 assert.match(text,new RegExp(ADDR));
 assert.match(text,/0\.25 SOL/);
});

test('it offers a way to buy SOL with a card',()=>{
 const {keyboard}=walletMessage(ADDR,'0');
 const buy=keyboard.flat().find(b=>'url' in b);
 assert.ok(buy,'no onramp button');
 assert.equal((buy as {url:string}).url,ONRAMP_URL);
 assert.match(buy!.text,/SOL/);
});

// The onramp sends to whatever address the user pastes. Veyro holds the key
// to this one, so it must never be prefilled into a third party's flow as a
// self-custody destination — the user pastes it themselves, deliberately.
test('the deposit address is never embedded in the onramp link',()=>{
 const {keyboard}=walletMessage(ADDR,'0');
 for(const b of keyboard.flat()){
  if('url' in b)assert.doesNotMatch(b.url,new RegExp(ADDR),'address prefilled into a third party URL');
 }
});

test('it warns that another chain loses the money',()=>{
 const {text}=walletMessage(ADDR,'0');
 assert.match(text,/Solana/);
 assert.match(text,/lost|gone|cannot be recovered/i);
});

test('it still discloses custody, because this is the deposit moment',()=>{
 const {text}=walletMessage(ADDR,'0');
 assert.match(text,/afford to lose/i);
});

test('an unreadable balance still shows the address and the buy button',()=>{
 const {text,keyboard}=walletMessage(ADDR,null);
 assert.match(text,new RegExp(ADDR));
 assert.doesNotMatch(text,/Balance: 0 SOL/);
 assert.ok(keyboard.flat().some(b=>'url' in b));
});
