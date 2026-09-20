import test from 'node:test';import assert from 'node:assert/strict';
const {macSpeaker,speaker}=await import('../lib/voice/tts');

const mac=macSpeaker();
const canRun=await mac.available();

test('availability is a real check, not an assumption',async()=>{
 assert.equal(typeof canRun,'boolean');
});

test('nothing to say produces no audio and spawns nothing',async()=>{
 assert.equal(await mac.synthesize(''),null);
 assert.equal(await mac.synthesize('   '),null);
});

test('an unavailable speaker returns null instead of throwing',async()=>{
 const broken=macSpeaker({sayBin:'/nonexistent/say',ffmpegBin:'/nonexistent/ffmpeg'});
 assert.equal(await broken.available(),false);
 assert.equal(await broken.synthesize('hello'),null);
});

test('the default speaker is chosen by what the host actually has',async()=>{
 const s=speaker();
 assert.equal(typeof (await s.available()),'boolean');
});

test('synthesis produces a real ogg opus voice note',{skip:!canRun&&'no say/ffmpeg on this host'},async()=>{
 const buf=await mac.synthesize('Confirm buying zero point two five sol of wif. Score seventy one.');
 assert.ok(buf&&buf.length>1000,'expected audio bytes, got '+(buf?buf.length:'null'));
 // OggS magic: Telegram rejects anything that is not a real ogg container.
 assert.equal(buf!.subarray(0,4).toString('ascii'),'OggS');
});

test('a long line is still bounded in size',{skip:!canRun&&'no say/ffmpeg on this host'},async()=>{
 const buf=await mac.synthesize('veyro '.repeat(80));
 assert.ok(buf,'expected audio');
 assert.ok(buf!.length<400_000,'voice notes must stay small: '+buf!.length);
});
