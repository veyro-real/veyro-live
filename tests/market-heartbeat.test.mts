import test from 'node:test';import assert from 'node:assert/strict';
const {createHeartbeat}=await import('../lib/market/heartbeat');

const T0=1_000_000_000_000;
const hb=()=>createHeartbeat({quietMs:300_000});

test('a healthy feed says nothing',()=>{
 const h=hb();
 h.seen(T0);
 assert.equal(h.check(T0+299_000),null);
});

test('silence past the threshold raises one alert',()=>{
 const h=hb();
 h.seen(T0);
 const a=h.check(T0+301_000);
 assert.equal(a?.kind,'down');
 assert.match(a!.text,/no launches/i);
 assert.match(a!.text,/5 min|300|minutes/i);
});

test('it does not repeat the alert every check while still down',()=>{
 const h=hb();
 h.seen(T0);
 assert.ok(h.check(T0+301_000),'first alert');
 assert.equal(h.check(T0+400_000),null,'still down, already told you');
 assert.equal(h.check(T0+900_000),null);
});

test('recovery is announced once when data returns',()=>{
 const h=hb();
 h.seen(T0);
 h.check(T0+301_000);
 h.seen(T0+400_000);
 const r=h.check(T0+401_000);
 assert.equal(r?.kind,'recovered');
 assert.match(r!.text,/back|recovered|resumed/i);
 assert.equal(h.check(T0+402_000),null,'and only once');
});

test('a second outage alerts again, it does not latch',()=>{
 const h=hb();
 h.seen(T0);
 h.check(T0+301_000);
 h.seen(T0+400_000);
 h.check(T0+401_000);
 assert.equal(h.check(T0+800_000)?.kind,'down','a new outage is new news');
});

test('a feed that never started still alerts from process start',()=>{
 const h=createHeartbeat({quietMs:300_000,startedAt:T0});
 assert.equal(h.check(T0+299_000),null);
 assert.equal(h.check(T0+301_000)?.kind,'down');
});

test('the alert says how long it has actually been quiet',()=>{
 const h=hb();
 h.seen(T0);
 assert.match(h.check(T0+900_000)!.text,/15/,'15 minutes quiet');
});
