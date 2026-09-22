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

// Without partner keys there is no way to sign, and an unsigned URL carrying
// a wallet address both leaks the destination and is refused by the widget.
// Prefilling is the signed partner path or it does not happen at all.
test('an unsigned onramp link never carries the deposit address',()=>{
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
