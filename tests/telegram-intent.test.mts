import test from 'node:test';import assert from 'node:assert/strict';
const {intentFromSpeech}=await import('../lib/telegram/intent');

const k=(t:string)=>intentFromSpeech(t)?.kind;

test('plain readonly asks map to their command',()=>{
 assert.equal(k('wallet'),'wallet');
 assert.equal(k('show me my wallet'),'wallet');
 assert.equal(k("what's my deposit address"),'wallet');
 assert.equal(k('what am I holding'),'positions');
 assert.equal(k('show my positions'),'positions');
 assert.equal(k('what passed the filter'),'scan');
 assert.equal(k('help'),'help');
});

test('whisper mishearing SOL as sold or soul still works',()=>{
 const a=intentFromSpeech('set my limits to 0.5 sold per trade, 2 sold daily, for 24 hours');
 assert.deepEqual(a,{kind:'limits',set:{maxTradeSol:0.5,dailyCapSol:2,hours:24}});
 const b=intentFromSpeech('set limits to 1 soul per trade 5 soul daily for 12 hours');
 assert.deepEqual(b,{kind:'limits',set:{maxTradeSol:1,dailyCapSol:5,hours:12}});
});

test('asking about limits reads rather than writes',()=>{
 assert.deepEqual(intentFromSpeech('what are my limits'),{kind:'limits',set:null});
 assert.deepEqual(intentFromSpeech('limits'),{kind:'limits',set:null});
});

test('a partial limits instruction is refused rather than half applied',()=>{
 assert.equal(intentFromSpeech('set my limits to 0.5 sol per trade'),null,
  'missing a daily cap and a duration must not be guessed');
});

test('stopping is understood several ways and always means revoke',()=>{
 for(const t of ['revoke','stop everything','switch off spending','turn off all spending']){
  assert.equal(k(t),'revoke',t);
 }
});

test('buying by spoken symbol is its own intent, because a mint cannot be dictated',()=>{
 assert.deepEqual(intentFromSpeech('buy 0.1 sol of wif'),{kind:'buyBySymbol',symbol:'wif',sol:0.1});
 assert.deepEqual(intentFromSpeech('buy 0.25 sold of doge'),{kind:'buyBySymbol',symbol:'doge',sol:0.25});
});

test('a buy with no amount is refused rather than defaulted',()=>{
 assert.equal(intentFromSpeech('buy some wif'),null);
 assert.equal(intentFromSpeech('buy wif'),null);
});

test('a spoken strategy is kept as the users own words',()=>{
 const i=intentFromSpeech('my edge is only tokens under 30 seconds old with locked liquidity');
 assert.equal(i?.kind,'edge');
 assert.equal(i?.kind==='edge'&&i.text,'only tokens under 30 seconds old with locked liquidity');
});

test('speech that is not a command is null, not a wrong guess',()=>{
 for(const t of ['','hello there','what do you think about the market','uhh']){
  assert.equal(intentFromSpeech(t),null,JSON.stringify(t));
 }
});

test('selling by voice is refused because a position id cannot be spoken',()=>{
 assert.equal(intentFromSpeech('sell my position'),null);
});

test('an explicit slash command spoken aloud still works',()=>{
 assert.equal(k('slash wallet'),'wallet');
 assert.equal(k('/wallet'),'wallet');
});
