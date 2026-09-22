import test from 'node:test';import assert from 'node:assert/strict';
import {intentFromSpeech,refusalFor} from '../src/telegram/intent';

test('selling by voice is refused with the reason, not a shrug',()=>{
 const why=refusalFor('I want you to sell every meme coin that I have.');
 assert.ok(why,'no explanation for a spoken sell');
 assert.match(why!,/\/positions/);
 assert.match(why!,/\/sell/);
 assert.doesNotMatch(why!,/did not understand/i);
});

test('a buy with no amount says which part was missing',()=>{
 const why=refusalFor("I don't care if I hold this token, I wanna buy more, so buy more.");
 assert.ok(why,'no explanation for an amountless buy');
 assert.match(why!,/how much|amount/i);
});

test('partial limits say all three are needed',()=>{
 // Digits present but not all three: a set that did not say enough.
 const why=refusalFor('set my limits to 0.5 sol per trade');
 assert.ok(why);
 assert.match(why!,/three|per trade.*day.*hours/i);
});

test('something genuinely unrecognised gets no invented explanation',()=>{
 assert.equal(refusalFor('what is the weather in tokyo'),null);
 assert.equal(refusalFor('hello there'),null);
});

// A refusal must never fire for something that actually works.
test('anything that parses is never given a refusal',()=>{
 for(const s of [
  'spend 50 cents on the dumbest meme coin',
  'buy 0.1 sol of bonk',
  'what am i holding',
  'stop everything',
  'what is hot',
 ]){
  assert.ok(intentFromSpeech(s),`${s} should parse`);
  assert.equal(refusalFor(s),null,`${s} parses but was also refused`);
 }
});
