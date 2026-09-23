import test from 'node:test';import assert from 'node:assert/strict';
const {matchSymbol}=await import('../src/trade/match-symbol');
const H=[
 {id:'a',symbol:'SATOSHINU',mint:'m1'},
 {id:'b',symbol:'STONKCAT',mint:'m2'},
 {id:'c',symbol:'WIF',mint:'m3'},
];

test('an exact spoken name matches, spacing and case ignored',()=>{
 assert.deepEqual(matchSymbol('satoshi nu',H),{kind:'one',holding:H[0]});
 assert.deepEqual(matchSymbol('WIF',H),{kind:'one',holding:H[2]});
});

test('a fragment inside one symbol matches only that one',()=>{
 assert.deepEqual(matchSymbol('inu',H),{kind:'one',holding:H[0]});
 assert.deepEqual(matchSymbol('cat',H),{kind:'one',holding:H[1]});
});

test('the spoken name containing the symbol also matches',()=>{
 assert.deepEqual(matchSymbol('wif token',H),{kind:'one',holding:H[2]});
 assert.deepEqual(matchSymbol('satoshinu coin',H),{kind:'one',holding:H[0]});
});

test('a fragment in two symbols is ambiguous, never a guess',()=>{
 const two=[{id:'a',symbol:'CATDOG',mint:'m1'},{id:'b',symbol:'STONKCAT',mint:'m2'}];
 const m=matchSymbol('cat',two);
 assert.equal(m.kind,'many');
});

test('nothing matches when the name is unrelated or empty',()=>{
 assert.equal(matchSymbol('dogecoin',H).kind,'none');
 assert.equal(matchSymbol('',H).kind,'none');
 assert.equal(matchSymbol('inu',[]).kind,'none');
});

// Whisper wraps the name in a sentence. A distinctive word inside it resolves.
test('a word inside a garbled sentence finds the one held token',()=>{
 const H2=[{id:'a',symbol:'STONKCAT',mint:'m1'},{id:'b',symbol:'SATOSHINU',mint:'m2'}];
 assert.deepEqual(matchSymbol('a cat with problem',H2),{kind:'one',holding:H2[0]});
 assert.deepEqual(matchSymbol('sell me the inu one',H2),{kind:'one',holding:H2[1]});
});

test('a word that lands in two held symbols stays ambiguous',()=>{
 const two=[{id:'a',symbol:'CATDOG',mint:'m1'},{id:'b',symbol:'STONKCAT',mint:'m2'}];
 assert.equal(matchSymbol('the cat thing',two).kind,'many');
});

test('short filler words never match on their own',()=>{
 const H2=[{id:'a',symbol:'ABC',mint:'m1'}];
 // "of","to","my" are 2 chars and skipped; nothing distinctive remains.
 assert.equal(matchSymbol('sell of to my',H2).kind,'none');
});
