import test from 'node:test';import assert from 'node:assert/strict';
import {verdictForUnconfirmed,DROP_GRACE_MS} from '../src/trade/reconcile-verdict';

const MIN=60_000;

test('a signature the cluster still knows is never called dropped',()=>{
 assert.equal(verdictForUnconfirmed({seenOnChain:true,ageMs:10*MIN}),'UNRESOLVED');
});

/**
 * A Solana transaction can only land while its blockhash is current, about
 * 90 seconds. Past a grace period, a signature the cluster has never seen
 * was dropped and never will land — the SOL was not spent.
 */
test('an unseen signature past the grace period is dropped',()=>{
 assert.equal(verdictForUnconfirmed({seenOnChain:false,ageMs:DROP_GRACE_MS+1}),'DROPPED');
});

test('an unseen signature inside the grace period is left alone',()=>{
 assert.equal(verdictForUnconfirmed({seenOnChain:false,ageMs:DROP_GRACE_MS-1}),'UNRESOLVED');
 assert.equal(verdictForUnconfirmed({seenOnChain:false,ageMs:0}),'UNRESOLVED');
});

test('the grace period is comfortably longer than a blockhash lives',()=>{
 assert.ok(DROP_GRACE_MS>=5*MIN,'too eager: a slow cluster would be called a drop');
});

// Releasing a reservation for a transaction that did land would let someone
// spend past their daily cap, so the doubtful case must stay unresolved.
test('anything uncertain stays unresolved rather than releasing',()=>{
 for(const ageMs of [0,MIN,DROP_GRACE_MS-1])
  assert.equal(verdictForUnconfirmed({seenOnChain:false,ageMs}),'UNRESOLVED');
 for(const ageMs of [0,DROP_GRACE_MS+1,60*MIN])
  assert.equal(verdictForUnconfirmed({seenOnChain:true,ageMs}),'UNRESOLVED');
});
