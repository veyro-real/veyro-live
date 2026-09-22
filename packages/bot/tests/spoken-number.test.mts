import test from 'node:test';import assert from 'node:assert/strict';
import {spokenNumber,refusalFor} from '../src/telegram/intent';

test('ordinary additive numbers still work',()=>{
 assert.equal(spokenNumber('twenty five'),25);
 assert.equal(spokenNumber('sixty nine'),69);
 assert.equal(spokenNumber('one hundred'),100);
 assert.equal(spokenNumber('one hundred twenty'),120);
 assert.equal(spokenNumber('two thousand five hundred'),2500);
 assert.equal(spokenNumber('nineteen'),19);
});

/**
 * "three fifty" is a price, not three plus fifty. English puts tens before
 * units, so a unit followed by a ten is not an additive number at all — and
 * reading it as one produced 53, 77 and 108 for amounts a person said as
 * 3.50, 8.69 and 9.99.
 */
test('a price idiom is refused, never silently re-added',()=>{
 for(const phrase of ['three fifty','eight sixty-nine','nine ninety nine','five twenty']){
  assert.equal(spokenNumber(phrase),null,`${phrase} must not produce a number`);
 }
});

test('a repeated unit or ten is not a number either',()=>{
 assert.equal(spokenNumber('five five'),null);
 assert.equal(spokenNumber('twenty thirty'),null);
});

test('hundreds and thousands reset the grouping',()=>{
 assert.equal(spokenNumber('one hundred sixty five'),165);
 assert.equal(spokenNumber('three thousand two hundred'),3200);
});

// The failure has to be visible, not silent.
test('an amount that cannot be read explains itself',()=>{
 const why=refusalFor('spend three fifty on the dumbest meme coin');
 assert.ok(why,'no explanation for an unreadable amount');
 assert.match(why!,/amount/i);
});

test('an amount and a target with no verb says which word is missing',()=>{
 const why=refusalFor('eight sixty-nine cents into the dumbest meme coin');
 assert.ok(why,'no explanation when only the verb is missing');
 assert.match(why!,/buy|spend/i);
});
