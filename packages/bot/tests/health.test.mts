import test from 'node:test';import assert from 'node:assert/strict';
const {probe}=await import('../src/health');

test('a passing probe reports ok with a duration',async()=>{
 const h=await probe({supabase:async()=>'reachable'});
 assert.equal(h.ok,true);
 assert.equal(h.checks[0].name,'supabase');
 assert.equal(h.checks[0].ok,true);
 assert.equal(h.checks[0].detail,'reachable');
 assert.ok(h.checks[0].ms>=0);
});

test('one failure fails the whole report but still runs the others',async()=>{
 const h=await probe({
  supabase:async()=>{throw Error('DB_DOWN');},
  rpc:async()=>'slot 123',
 });
 assert.equal(h.ok,false);
 const byName=Object.fromEntries(h.checks.map(c=>[c.name,c]));
 assert.equal(byName.supabase.ok,false);
 assert.equal(byName.supabase.detail,'DB_DOWN');
 assert.equal(byName.rpc.ok,true);
});

test('a probe that hangs is failed, not waited on forever',async()=>{
 const h=await probe({slow:()=>new Promise(()=>{})},{timeoutMs:25});
 assert.equal(h.ok,false);
 assert.equal(h.checks[0].ok,false);
 assert.match(h.checks[0].detail!,/TIMEOUT/);
});

test('no secret can leak through a probe detail',async()=>{
 const h=await probe({supabase:async()=>{throw Error('failed for https://x.supabase.co with key sb_secret_abc123');}});
 assert.ok(!/sb_secret/.test(JSON.stringify(h)),'raw key must be scrubbed');
});
