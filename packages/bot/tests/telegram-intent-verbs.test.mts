import test from 'node:test';import assert from 'node:assert/strict';
import {intentFromSpeech} from '../src/telegram/intent';

test('spend is a way of saying buy',()=>{
 assert.deepEqual(intentFromSpeech('Spend 69 cents on the dumbest meme coin.'),
  {kind:'buyTrending',usd:0.69});
});

test('so are ape and purchase',()=>{
 assert.deepEqual(intentFromSpeech('ape five dollars into the dumbest meme coin'),
  {kind:'buyTrending',usd:5});
 assert.deepEqual(intentFromSpeech('purchase 2 dollars of the dumbest memecoin'),
  {kind:'buyTrending',usd:2});
});

test('on and into work as prepositions for a symbol',()=>{
 assert.deepEqual(intentFromSpeech('spend five dollars on bonk'),
  {kind:'buyBySymbol',symbol:'bonk',usd:5});
 assert.deepEqual(intentFromSpeech('ape 0.1 sol into bonk'),
  {kind:'buyBySymbol',symbol:'bonk',sol:0.1});
});

test('buy still works exactly as before',()=>{
 assert.deepEqual(intentFromSpeech('Buy 69 cents of the dumbest meme coin'),
  {kind:'buyTrending',usd:0.69});
 assert.deepEqual(intentFromSpeech('buy 0.5 sol of bonk'),
  {kind:'buyBySymbol',symbol:'bonk',sol:0.5});
});

// The amount is the one thing that must never be guessed.
test('a buy verb with no amount is still a refusal',()=>{
 assert.equal(intentFromSpeech('spend on the dumbest meme coin'),null);
 assert.equal(intentFromSpeech('ape into bonk'),null);
});

// A new verb must not swallow an utterance that means something else.
test('adding verbs does not shadow the other commands',()=>{
 assert.deepEqual(intentFromSpeech('what am i holding'),{kind:'positions',includeClosed:false});
 assert.deepEqual(intentFromSpeech('my bags'),{kind:'positions',includeClosed:false});
 assert.deepEqual(intentFromSpeech('what is hot'),{kind:'trending',limit:5});
 assert.deepEqual(intentFromSpeech('stop everything'),{kind:'revoke'});
});

// No verb at all stays a refusal: this module does not infer that a bare
// amount means spend it.
test('an amount with no verb is not a trade',()=>{
 assert.equal(intentFromSpeech('69 cents on the dumbest memecoin'),null);
});
