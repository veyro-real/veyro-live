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
